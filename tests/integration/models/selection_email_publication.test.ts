import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { enqueueSelectionEmailEvent } from "infra/selection-email-queue";
import storeSelection from "models/store_selection";
import { processSelectionEmailBatch } from "models/selection_email";
import {
  processSelectionEmailEvent,
  recordSelectionEmailPublication,
} from "models/selection_email_event";
import orchestrator from "tests/orchestrator";

jest.mock("infra/selection-email-queue", () => ({
  enqueueSelectionEmailBatch: jest.fn(),
  enqueueSelectionEmailEvent: jest.fn(),
}));

const originalFlag = process.env.OUTLET_SELECTION_EMAILS_ENABLED;
beforeAll(() => orchestrator.waitForAllServices());
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  jest.mocked(enqueueSelectionEmailEvent).mockReset();
});
afterAll(async () => {
  if (originalFlag === undefined)
    delete process.env.OUTLET_SELECTION_EMAILS_ENABLED;
  else process.env.OUTLET_SELECTION_EMAILS_ENABLED = originalFlag;
  await prisma.$disconnect();
});

async function fixture() {
  const owner = await orchestrator.createUser();
  const outlet = await orchestrator.createStore(owner.id);
  const game = await orchestrator.createGame(owner.id);
  const secondGame = await orchestrator.createGame(owner.id);
  await prisma.game.updateMany({
    where: { id: { in: [game.id, secondGame.id] } },
    data: { status: "ACTIVE" },
  });
  const selection = await storeSelection.create(outlet.id, {
    slug: "together",
    title: "Jogos para jogar juntos",
    description: "Uma seleção do curador, preservada em português.",
    cover_url: "https://images.example.com/selection.png",
    game_slugs: [game.slug, secondGame.slug],
  });
  return { owner, outlet, game, secondGame, selection };
}

async function subscribers(
  storeId: string,
  count: number,
  when = new Date(Date.now() - 60_000),
) {
  for (let offset = 0; offset < count; offset += 1000) {
    const rows = Array.from({ length: Math.min(1000, count - offset) }, () => {
      const id = randomUUID();
      return {
        id,
        username: `reader-${id.slice(0, 20)}`,
        email: `${id}@example.test`,
        features: ["create:store_follow"],
        verified_email: `${id}@example.test`,
        email_verified_at: when,
        created_at: when,
      };
    });
    await prisma.user.createMany({ data: rows });
    await prisma.storeFollow.createMany({
      data: rows.map((row) => ({
        user_id: row.id,
        store_id: storeId,
        created_at: when,
      })),
    });
    await prisma.outletNotificationSubscription.createMany({
      data: rows.map((row) => ({
        user_id: row.id,
        store_id: storeId,
        consent_email: row.email,
        email_version: 0,
        enabled_at: when,
        created_at: when,
      })),
    });
  }
}

test("concurrent first publication commits one edition and one durable event", async () => {
  const f = await fixture();
  const result = await Promise.allSettled(
    [1, 2].map(() =>
      storeSelection.publish(f.outlet.id, f.selection.slug, f.owner.id, 1),
    ),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await prisma.selectionEmailEvent.count()).toBe(1);
  expect(await prisma.storeSelectionRevision.count()).toBe(1);
  const event = await prisma.selectionEmailEvent.findFirstOrThrow();
  const row = await storeSelection.findDraft(f.outlet.id, f.selection.slug);
  expect(event.revision_id).toBe(row.published_revision_id);
  expect(jest.mocked(enqueueSelectionEmailEvent)).toHaveBeenCalledTimes(1);
});

test("edits, reordered games, videos, repeated requests and withdraw/republish never create another event", async () => {
  const f = await fixture();
  let row = await storeSelection.publish(
    f.outlet.id,
    f.selection.slug,
    f.owner.id,
    1,
  );
  await expect(
    storeSelection.publish(f.outlet.id, f.selection.slug, f.owner.id, 1),
  ).rejects.toMatchObject({ name: "ConflictError" });
  row = await storeSelection.update(f.outlet.id, row.slug, {
    expected_draft_revision: row.draft_revision,
    title: "Edited title",
    description: "Edited description",
    featured_video_url: "https://youtu.be/g7QcidQx73s?t=68",
    cover_url: "https://images.example.com/edited.png",
    game_slugs: [f.secondGame.slug, f.game.slug],
    image_urls: [],
  });
  expect(await prisma.selectionEmailEvent.count()).toBe(1);
  row = await storeSelection.publish(
    f.outlet.id,
    row.slug,
    f.owner.id,
    row.draft_revision,
  );
  row = await storeSelection.unpublish(
    f.outlet.id,
    row.slug,
    row.draft_revision,
  );
  expect(row.published_revision).toBe(2);
  row = await storeSelection.publish(
    f.outlet.id,
    row.slug,
    f.owner.id,
    row.draft_revision,
  );
  expect(row.published_revision).toBe(3);
  expect(await prisma.selectionEmailEvent.count()).toBe(1);
  expect(jest.mocked(enqueueSelectionEmailEvent)).toHaveBeenCalledTimes(1);
});

test("an event rolls back with its transaction; a lost queue wakeup preserves the committed publication", async () => {
  const f = await fixture();
  await expect(
    prisma.$transaction(async (tx) => {
      await recordSelectionEmailPublication(tx, {
        selectionId: f.selection.id,
        storeId: f.outlet.id,
        revisionId: randomUUID(),
        occurredAt: new Date(),
      });
      throw new Error("Controlled transaction rollback");
    }),
  ).rejects.toThrow("Controlled transaction rollback");
  expect(await prisma.selectionEmailEvent.count()).toBe(0);
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest
    .mocked(enqueueSelectionEmailEvent)
    .mockRejectedValueOnce(new Error("Controlled queue failure"));
  try {
    const row = await storeSelection.publish(
      f.outlet.id,
      f.selection.slug,
      f.owner.id,
      1,
    );
    expect(row.status).toBe("PUBLISHED");
    expect(await prisma.selectionEmailEvent.count()).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        component: "selection_email_outbox",
        outcome: "queue_wakeup_pending",
      }),
    );
  } finally {
    warn.mockRestore();
  }
});

test("enabling the feature never sends history for an already published selection", async () => {
  const f = await fixture();
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "false";
  let row = await storeSelection.publish(
    f.outlet.id,
    f.selection.slug,
    f.owner.id,
    1,
  );
  expect(await prisma.selectionEmailEvent.count()).toBe(0);
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  row = await storeSelection.update(f.outlet.id, row.slug, {
    title: "After rollout",
    expected_draft_revision: row.draft_revision,
  });
  row = await storeSelection.publish(
    f.outlet.id,
    row.slug,
    f.owner.id,
    row.draft_revision,
  );
  expect(row.published_revision).toBe(2);
  expect(await prisma.selectionEmailEvent.count()).toBe(0);
  expect(jest.mocked(enqueueSelectionEmailEvent)).not.toHaveBeenCalled();
});

test("a failed publication leaves both the edition and outbox empty", async () => {
  const f = await fixture();
  await prisma.storeSelection.update({
    where: { id: f.selection.id },
    data: { description: "" },
  });
  await expect(
    storeSelection.publish(f.outlet.id, f.selection.slug, f.owner.id, 1),
  ).rejects.toMatchObject({ name: "ValidationError" });
  expect(await prisma.storeSelectionRevision.count()).toBe(0);
  expect(await prisma.selectionEmailEvent.count()).toBe(0);
  expect(
    (await storeSelection.findDraft(f.outlet.id, f.selection.slug))
      .draft_revision,
  ).toBe(1);
});

test("late subscribers receive no history and repeated queue delivery creates no duplicate recipients", async () => {
  const f = await fixture();
  await subscribers(f.outlet.id, 2);
  await storeSelection.publish(f.outlet.id, f.selection.slug, f.owner.id, 1);
  const event = await prisma.selectionEmailEvent.findFirstOrThrow();
  await subscribers(
    f.outlet.id,
    1,
    new Date(event.occurred_at.getTime() + 1000),
  );
  expect(await processSelectionEmailEvent(event.id)).toMatchObject({
    status: "COMPLETE",
    deliveries: 2,
  });
  expect(await processSelectionEmailEvent(event.id)).toMatchObject({
    status: "NOOP",
    deliveries: 0,
  });
  expect(await prisma.selectionEmailDelivery.count()).toBe(2);
  expect(await prisma.selectionEmailBatch.count()).toBe(1);
});

test("a withdrawn selection cancels fanout before any recipient is handed off", async () => {
  const f = await fixture();
  await subscribers(f.outlet.id, 1);
  const row = await storeSelection.publish(
    f.outlet.id,
    f.selection.slug,
    f.owner.id,
    1,
  );
  const event = await prisma.selectionEmailEvent.findFirstOrThrow();
  await storeSelection.unpublish(f.outlet.id, row.slug, row.draft_revision);
  expect(await processSelectionEmailEvent(event.id)).toMatchObject({
    status: "CANCELLED",
    deliveries: 0,
  });
  expect(await prisma.selectionEmailDelivery.count()).toBe(0);
});

test("first publication reaches Mailcatcher once with localized HTML/text and unchanged curator copy", async () => {
  const oldOrigin = process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN;
  const oldTransport = process.env.OUTLET_SELECTION_EMAIL_TRANSPORT;
  process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN = "http://127.0.0.1:3004";
  process.env.OUTLET_SELECTION_EMAIL_TRANSPORT = "smtp";
  try {
    await orchestrator.deleteAllEmails();
    const f = await fixture();
    await subscribers(f.outlet.id, 2);
    const readers = await prisma.outletNotificationSubscription.findMany();
    await prisma.userNotificationPreference.createMany({
      data: readers.map((row, index) => ({
        user_id: row.user_id,
        email_locale: index === 0 ? "pt-BR" : "en",
      })),
    });
    await storeSelection.publish(f.outlet.id, f.selection.slug, f.owner.id, 1);
    const event = await prisma.selectionEmailEvent.findFirstOrThrow();
    await processSelectionEmailEvent(event.id);
    const batch = await prisma.selectionEmailBatch.findFirstOrThrow();
    expect(await processSelectionEmailBatch(batch.id)).toMatchObject({
      status: "ACCEPTED",
      accepted: 2,
    });
    expect(await processSelectionEmailBatch(batch.id)).toMatchObject({
      status: "NOOP",
    });
    const sink = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;
    const messages: Array<{
      id: number;
      subject: string;
      recipients: string[];
    }> = await (await fetch(`${sink}/messages`)).json();
    expect(messages).toHaveLength(2);
    expect(
      messages.some((message) =>
        message.subject.endsWith("publicou uma nova seleção"),
      ),
    ).toBe(true);
    expect(
      messages.some((message) =>
        message.subject.endsWith("published a new selection"),
      ),
    ).toBe(true);
    for (const message of messages) {
      expect(message.recipients).toHaveLength(1);
      const html = await (
        await fetch(`${sink}/messages/${message.id}.html`)
      ).text();
      const text = await (
        await fetch(`${sink}/messages/${message.id}.plain`)
      ).text();
      expect(html).toContain("images/brand/manifold-logo.png");
      expect(html).toContain(f.selection.title);
      expect(text).toContain(f.selection.description);
      expect(html).toContain("notifications/unsubscribe#token=");
      expect(html).toContain("settings/notifications");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("R$");
    }
    expect(
      await prisma.selectionEmailDelivery.count({
        where: { status: "ACCEPTED" },
      }),
    ).toBe(2);
  } finally {
    if (oldOrigin === undefined)
      delete process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN;
    else process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN = oldOrigin;
    if (oldTransport === undefined)
      delete process.env.OUTLET_SELECTION_EMAIL_TRANSPORT;
    else process.env.OUTLET_SELECTION_EMAIL_TRANSPORT = oldTransport;
  }
});

test("10,000 recipients use twenty bounded pages and one hundred unique batches without sending email", async () => {
  const f = await fixture();
  await subscribers(f.outlet.id, 10_000);
  await storeSelection.publish(f.outlet.id, f.selection.slug, f.owner.id, 1);
  const event = await prisma.selectionEmailEvent.findFirstOrThrow();
  let total = 0;
  for (let page = 0; page < 20; page++) {
    const result = await processSelectionEmailEvent(event.id);
    expect(result.deliveries).toBe(500);
    expect(result.status).toBe(page === 19 ? "COMPLETE" : "FANOUT");
    total += result.deliveries;
  }
  expect(total).toBe(10_000);
  expect(await prisma.selectionEmailDelivery.count()).toBe(10_000);
  expect(await prisma.selectionEmailBatch.count()).toBe(100);
  const batches = await prisma.selectionEmailDelivery.groupBy({
    by: ["batch_id"],
    _count: { _all: true },
  });
  expect(batches).toHaveLength(100);
  expect(batches.every((row) => row.batch_id && row._count._all === 100)).toBe(
    true,
  );
  await processSelectionEmailEvent(event.id);
  expect(await prisma.selectionEmailDelivery.count()).toBe(10_000);
}, 60_000);
