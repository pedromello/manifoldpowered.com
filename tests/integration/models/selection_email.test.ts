import { createHash, randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import {
  sendSelectionEmailBatch,
  SelectionEmailTransportError,
} from "infra/selection-email";
import {
  handleSelectionEmailWebhook,
  processSelectionEmailBatch,
  recoverSelectionEmails,
} from "models/selection_email";
import orchestrator from "tests/orchestrator";

jest.mock("infra/selection-email", () => ({
  ...jest.requireActual("infra/selection-email"),
  sendSelectionEmailBatch: jest.fn(),
}));
jest.mock("infra/selection-email-queue", () => ({
  enqueueSelectionEmailEvent: jest.fn(),
  enqueueSelectionEmailBatch: jest.fn(),
}));

const originalEnv = { ...process.env };
const send = jest.mocked(sendSelectionEmailBatch);
beforeAll(() => orchestrator.waitForAllServices());
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  process.env.SELECTION_EMAIL_DAILY_LIMIT = "10000";
  process.env.EMAIL_FROM = "Manifold <notifications@example.com>";
  process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN =
    "https://www.manifoldpowered.com";
  send.mockReset();
  send.mockImplementation(async (messages) => {
    await new Promise((resolve) => setImmediate(resolve));
    return messages.map(() => ({ id: randomUUID() }));
  });
});
afterAll(() => {
  process.env = { ...originalEnv };
});

async function fixture(recipientCount = 1) {
  const before = new Date(Date.now() - 60_000);
  const owner = await prisma.user.create({
    data: {
      username: `owner${randomUUID().slice(0, 12)}`,
      email: `owner-${randomUUID()}@example.com`,
      features: ["create:store", "create:store_follow"],
    },
  });
  const outlet = await orchestrator.createStore(owner.id, {
    name: `Email Club ${randomUUID().slice(0, 8)}`,
    logo_url: "https://images.example.com/club.png",
  });
  const game = await orchestrator.createGame(owner.id, {
    title: `Game ${randomUUID().slice(0, 8)}`,
    price: 20,
  });
  const readers = [];
  const subscriptions = [];
  for (let index = 0; index < recipientCount; index++) {
    const email = `reader-${randomUUID()}@example.com`;
    const reader = await prisma.user.create({
      data: {
        username: `reader${randomUUID().slice(0, 12)}`,
        email,
        verified_email: email,
        email_verified_at: before,
        features: ["create:store_follow"],
        created_at: before,
      },
    });
    readers.push(reader);
    await prisma.userNotificationPreference.create({
      data: {
        user_id: reader.id,
        email_locale: index % 2 === 0 ? "pt-BR" : "en",
      },
    });
    await prisma.storeFollow.create({
      data: { user_id: reader.id, store_id: outlet.id, created_at: before },
    });
    subscriptions.push(
      await prisma.outletNotificationSubscription.create({
        data: {
          user_id: reader.id,
          store_id: outlet.id,
          consent_email: reader.email,
          email_version: reader.email_version,
          created_at: before,
          enabled_at: before,
        },
      }),
    );
  }
  const selection = await prisma.storeSelection.create({
    data: {
      store_id: outlet.id,
      slug: `selection-${randomUUID().slice(0, 8)}`,
      title: "Published title",
      description: "Published curator description",
      game_ids: [game.id],
      cover_url: "https://images.example.com/selection.png",
    },
  });
  const revision = await prisma.storeSelectionRevision.create({
    data: {
      selection_id: selection.id,
      revision: 1,
      source_draft_revision: 1,
      actor_user_id: owner.id,
      snapshot: {
        title: selection.title,
        description: selection.description,
        cover_url: selection.cover_url,
        featured_video: null,
        image_urls: [],
        game_ids: [game.id],
      },
    },
  });
  await prisma.storeSelection.update({
    where: { id: selection.id },
    data: {
      status: "PUBLISHED",
      published_revision: 1,
      published_revision_id: revision.id,
      published_at: revision.created_at,
    },
  });
  const event = await prisma.selectionEmailEvent.create({
    data: {
      selection_id: selection.id,
      store_id: outlet.id,
      revision_id: revision.id,
      occurred_at: revision.created_at,
      status: "COMPLETE",
    },
  });
  const batch = await prisma.selectionEmailBatch.create({
    data: { event_id: event.id, idempotency_key: `test/${randomUUID()}` },
  });
  const deliveries = [];
  for (let index = 0; index < readers.length; index++)
    deliveries.push(
      await prisma.selectionEmailDelivery.create({
        data: {
          event_id: event.id,
          user_id: readers[index].id,
          subscription_id: subscriptions[index].id,
          subscription_generation: subscriptions[index].generation,
          email_version: readers[index].email_version,
          recipient_email: readers[index].email,
          batch_id: batch.id,
        },
      }),
    );
  return {
    owner,
    outlet,
    game,
    selection,
    revision,
    event,
    batch,
    readers,
    subscriptions,
    deliveries,
  };
}

async function makeDue(batchId: string) {
  const past = new Date(Date.now() - 5_000);
  await prisma.selectionEmailRateLimit.updateMany({ data: { next_at: past } });
  await prisma.selectionEmailBatch.update({
    where: { id: batchId },
    data: { next_attempt_at: past },
  });
}

function webhook(type: string, providerId: string, data = {}) {
  return {
    type,
    created_at: new Date().toISOString(),
    data: { email_id: providerId, ...data },
  };
}

test("two workers can claim one batch only once and freeze sender plus localized messages", async () => {
  const f = await fixture(2);
  await Promise.all([
    processSelectionEmailBatch(f.batch.id),
    processSelectionEmailBatch(f.batch.id),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  const [messages, key] = send.mock.calls[0];
  expect(messages).toHaveLength(2);
  expect(messages.map((message) => message.to).sort()).toEqual(
    f.readers.map((reader) => reader.email).sort(),
  );
  expect(
    messages.every((message) => message.from === process.env.EMAIL_FROM),
  ).toBe(true);
  expect(messages[0].html).toContain("Published title");
  expect(messages.map((message) => message.subject).join(" ")).toContain(
    "publicou uma nova seleção",
  );
  expect(messages.map((message) => message.subject).join(" ")).toContain(
    "published a new selection",
  );
  const batch = await prisma.selectionEmailBatch.findUniqueOrThrow({
    where: { id: f.batch.id },
  });
  expect(batch.status).toBe("ACCEPTED");
  expect(batch.idempotency_key).toBe(key);
  expect(batch.payload_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(
    await prisma.selectionEmailDelivery.count({
      where: { batch_id: batch.id, status: "ACCEPTED" },
    }),
  ).toBe(2);
});

test("legacy mixed-case user addresses remain eligible after ordinary address proof", async () => {
  const f = await fixture();
  await prisma.user.update({
    where: { id: f.readers[0].id },
    data: { email: f.readers[0].email.toUpperCase() },
  });
  expect((await processSelectionEmailBatch(f.batch.id)).status).toBe(
    "ACCEPTED",
  );
  expect(send.mock.calls[0][0][0].to).toBe(f.readers[0].email);
});

test("an uncertain retry resends exactly the frozen payload and key despite preference/content changes", async () => {
  const f = await fixture(2);
  send.mockRejectedValueOnce(
    new SelectionEmailTransportError("uncertain", 1, "test_network"),
  );
  await processSelectionEmailBatch(f.batch.id);
  const first = JSON.stringify(send.mock.calls[0]);
  await prisma.userNotificationPreference.updateMany({
    data: { email_locale: "en" },
  });
  await prisma.storeSelection.update({
    where: { id: f.selection.id },
    data: { title: "Changed draft", description: "Changed draft text" },
  });
  await prisma.outletNotificationSubscription.update({
    where: { id: f.subscriptions[0].id },
    data: { enabled: false, generation: { increment: 1 } },
  });
  process.env.EMAIL_FROM = "Changed Sender <changed@example.com>";
  await makeDue(f.batch.id);
  expect((await processSelectionEmailBatch(f.batch.id)).status).toBe(
    "ACCEPTED",
  );
  expect(JSON.stringify(send.mock.calls[1])).toBe(first);
  expect(send.mock.calls[1][0][0].html).not.toContain("Changed draft");
});

test("uncertain requests older than 23 hours are quarantined rather than resent", async () => {
  const f = await fixture();
  send.mockRejectedValueOnce(new SelectionEmailTransportError("uncertain"));
  await processSelectionEmailBatch(f.batch.id);
  await prisma.selectionEmailBatch.update({
    where: { id: f.batch.id },
    data: { first_attempt_at: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
  await makeDue(f.batch.id);
  expect((await processSelectionEmailBatch(f.batch.id)).status).toBe(
    "QUARANTINED",
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    (
      await prisma.selectionEmailBatch.findUniqueOrThrow({
        where: { id: f.batch.id },
      })
    ).status,
  ).toBe("QUARANTINED");
});

test("known rejection can rebuild a changed recipient subset with a fresh batch key", async () => {
  const f = await fixture(2);
  send.mockRejectedValueOnce(
    new SelectionEmailTransportError("retryable", 120, "resend_http_429"),
  );
  await processSelectionEmailBatch(f.batch.id);
  const originalKey = send.mock.calls[0][1];
  await prisma.outletNotificationSubscription.update({
    where: { id: f.subscriptions[0].id },
    data: { enabled: false, generation: { increment: 1 } },
  });
  await makeDue(f.batch.id);
  await processSelectionEmailBatch(f.batch.id);
  const fork = await prisma.selectionEmailBatch.findFirst({
    where: { event_id: f.event.id, id: { not: f.batch.id } },
  });
  expect(fork).not.toBeNull();
  if (send.mock.calls.length === 1) {
    await makeDue(fork!.id);
    await processSelectionEmailBatch(fork!.id);
  }
  expect(send.mock.calls[1][0].map((message) => message.to)).toEqual([
    f.readers[1].email,
  ]);
  expect(send.mock.calls[1][1]).not.toBe(originalKey);
  expect(
    (
      await prisma.selectionEmailDelivery.findUniqueOrThrow({
        where: { id: f.deliveries[0].id },
      })
    ).status,
  ).toBe("CANCELLED");
});

test("global admission allows one batch per second across independent jobs", async () => {
  const f = await fixture(2);
  const other = await prisma.selectionEmailBatch.create({
    data: { event_id: f.event.id, idempotency_key: `test/${randomUUID()}` },
  });
  await prisma.selectionEmailDelivery.update({
    where: { id: f.deliveries[1].id },
    data: { batch_id: other.id },
  });
  await processSelectionEmailBatch(f.batch.id);
  await prisma.selectionEmailRateLimit.update({
    where: { key: "bulk" },
    data: { next_at: new Date(Date.now() + 60_000) },
  });
  expect((await processSelectionEmailBatch(other.id)).status).toBe("RETRY");
  expect(send).toHaveBeenCalledTimes(1);
  await makeDue(other.id);
  expect((await processSelectionEmailBatch(other.id)).status).toBe("ACCEPTED");
  expect(send).toHaveBeenCalledTimes(2);
});

test("an active handoff lease reschedules work instead of acknowledging its only wake-up", async () => {
  const f = await fixture();
  send.mockRejectedValueOnce(new SelectionEmailTransportError("uncertain"));
  await processSelectionEmailBatch(f.batch.id);
  const { enqueueSelectionEmailBatch } =
    await import("infra/selection-email-queue");
  jest.mocked(enqueueSelectionEmailBatch).mockClear();
  await prisma.selectionEmailBatch.update({
    where: { id: f.batch.id },
    data: {
      status: "IN_FLIGHT",
      lease_token: randomUUID(),
      lease_until: new Date(Date.now() + 60_000),
      next_attempt_at: new Date(Date.now() - 1000),
    },
  });
  expect((await processSelectionEmailBatch(f.batch.id)).status).toBe("RETRY");
  expect(send).toHaveBeenCalledTimes(1);
  const wake = jest
    .mocked(enqueueSelectionEmailBatch)
    .mock.calls.find(([id]) => id === f.batch.id);
  expect(wake).toBeDefined();
  expect(wake![1]).toBeGreaterThan(0);
  await prisma.selectionEmailBatch.update({
    where: { id: f.batch.id },
    data: { lease_until: new Date(Date.now() - 1000) },
  });
  await makeDue(f.batch.id);
  expect((await processSelectionEmailBatch(f.batch.id)).status).toBe(
    "ACCEPTED",
  );
  expect(send).toHaveBeenCalledTimes(2);
});

test("time spent waiting on the global gate does not consume the next send window", async () => {
  const f = await fixture(2);
  const other = await prisma.selectionEmailBatch.create({
    data: { event_id: f.event.id, idempotency_key: `test/${randomUUID()}` },
  });
  await prisma.selectionEmailDelivery.update({
    where: { id: f.deliveries[1].id },
    data: { batch_id: other.id },
  });
  await prisma.selectionEmailRateLimit.create({
    data: { key: "bulk", next_at: new Date(Date.now() - 5000) },
  });
  let entered!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocker = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT key FROM selection_email_rate_limits WHERE key = 'bulk' FOR UPDATE`;
      entered();
      await released;
    },
    { timeout: 10_000 },
  );
  await locked;
  const first = processSelectionEmailBatch(f.batch.id);
  // A real row-lock wait longer than the complete one-second admission window.
  await new Promise((resolve) => setTimeout(resolve, 1300));
  release();
  await blocker;
  await first;
  expect(send).toHaveBeenCalledTimes(1);
  expect((await processSelectionEmailBatch(other.id)).status).toBe("RETRY");
  expect(send).toHaveBeenCalledTimes(1);
});

test("daily UTC budget splits a batch and defers only the excess until the next day", async () => {
  process.env.SELECTION_EMAIL_DAILY_LIMIT = "2";
  const f = await fixture(3);
  const nextDay = new Date();
  nextDay.setUTCHours(24, 0, 0, 0);
  await processSelectionEmailBatch(f.batch.id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toHaveLength(2);
  expect(
    (await prisma.selectionEmailDailyBudget.findMany()).reduce(
      (sum, budget) => sum + budget.reserved,
      0,
    ),
  ).toBe(2);
  const pending = await prisma.selectionEmailBatch.findFirst({
    where: { event_id: f.event.id, id: { not: f.batch.id } },
  });
  expect(pending).not.toBeNull();
  expect(pending!.first_attempt_at).toBeNull();
  expect(pending!.next_attempt_at.getTime()).toBeGreaterThanOrEqual(
    nextDay.getTime(),
  );
  expect(
    await prisma.selectionEmailDelivery.count({
      where: { batch_id: pending!.id, status: "PENDING" },
    }),
  ).toBe(1);
});

test("permanent provider rejection is terminal and never retried automatically", async () => {
  const f = await fixture();
  send.mockRejectedValueOnce(
    new SelectionEmailTransportError("permanent", 60, "resend_http_400"),
  );
  await processSelectionEmailBatch(f.batch.id);
  await makeDue(f.batch.id);
  await processSelectionEmailBatch(f.batch.id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    (
      await prisma.selectionEmailBatch.findUniqueOrThrow({
        where: { id: f.batch.id },
      })
    ).status,
  ).toBe("FAILED");
  expect(
    (
      await prisma.selectionEmailDelivery.findUniqueOrThrow({
        where: { id: f.deliveries[0].id },
      })
    ).status,
  ).toBe("FAILED");
});

test("delivery webhook arriving before API response remains durable and reconciles after mapping", async () => {
  const f = await fixture();
  const providerId = randomUUID();
  send.mockImplementationOnce(async () => {
    await handleSelectionEmailWebhook(
      webhook("email.delivered", providerId),
      "webhook-before-response",
    );
    expect(
      (
        await prisma.selectionEmailWebhook.findUniqueOrThrow({
          where: { id: "webhook-before-response" },
        })
      ).processed,
    ).toBe(false);
    return [{ id: providerId }];
  });
  await processSelectionEmailBatch(f.batch.id);
  expect(
    (
      await prisma.selectionEmailDelivery.findUniqueOrThrow({
        where: { id: f.deliveries[0].id },
      })
    ).status,
  ).toBe("DELIVERED");
  expect(
    (
      await prisma.selectionEmailWebhook.findUniqueOrThrow({
        where: { id: "webhook-before-response" },
      })
    ).processed,
  ).toBe(true);
  await handleSelectionEmailWebhook(
    webhook("email.delivered", providerId),
    "webhook-before-response",
  );
  expect(await prisma.selectionEmailWebhook.count()).toBe(1);
});

test("hard bounce and complaint suppress the address and cannot be overwritten by later delivery", async () => {
  const f = await fixture();
  const providerId = randomUUID();
  send.mockResolvedValueOnce([{ id: providerId }]);
  await processSelectionEmailBatch(f.batch.id);
  await handleSelectionEmailWebhook(
    webhook("email.bounced", providerId, { bounce: { type: "Permanent" } }),
    "hard-bounce",
  );
  await handleSelectionEmailWebhook(
    webhook("email.delivered", providerId),
    "late-delivery",
  );
  expect(
    (
      await prisma.selectionEmailDelivery.findUniqueOrThrow({
        where: { id: f.deliveries[0].id },
      })
    ).status,
  ).toBe("BOUNCED");
  const hash = createHash("sha256")
    .update(f.readers[0].email.toLowerCase())
    .digest("hex");
  expect(
    await prisma.selectionEmailSuppression.findUnique({
      where: { email_hash: hash },
    }),
  ).not.toBeNull();
  await handleSelectionEmailWebhook(
    webhook("email.complained", providerId),
    "complaint",
  );
  await handleSelectionEmailWebhook(
    webhook("email.delivered", providerId),
    "late-delivery-again",
  );
  expect(
    (
      await prisma.selectionEmailDelivery.findUniqueOrThrow({
        where: { id: f.deliveries[0].id },
      })
    ).status,
  ).toBe("COMPLAINED");
});

test.each(["withdrawn", "unfollowed", "disabled", "changed-address"])(
  "%s before first handoff cancels delivery without contacting the provider",
  async (scenario) => {
    const f = await fixture();
    if (scenario === "withdrawn")
      await prisma.storeSelection.update({
        where: { id: f.selection.id },
        data: { status: "DRAFT", published_revision_id: null },
      });
    if (scenario === "unfollowed")
      await prisma.storeFollow.deleteMany({
        where: { user_id: f.readers[0].id, store_id: f.outlet.id },
      });
    if (scenario === "disabled")
      await prisma.outletNotificationSubscription.update({
        where: { id: f.subscriptions[0].id },
        data: { enabled: false },
      });
    if (scenario === "changed-address")
      await prisma.user.update({
        where: { id: f.readers[0].id },
        data: {
          email: `new-${randomUUID()}@example.com`,
          email_version: { increment: 1 },
          verified_email: null,
          email_verified_at: null,
        },
      });
    expect((await processSelectionEmailBatch(f.batch.id)).status).toBe(
      "CANCELLED",
    );
    expect(send).not.toHaveBeenCalled();
  },
);

test("recovery re-enqueues durable prepared work even when fan-out is complete", async () => {
  const f = await fixture();
  const { enqueueSelectionEmailBatch } =
    await import("infra/selection-email-queue");
  await recoverSelectionEmails();
  expect(
    jest
      .mocked(enqueueSelectionEmailBatch)
      .mock.calls.some(([id]) => id === f.batch.id),
  ).toBe(true);
  expect(send).not.toHaveBeenCalled();
});
