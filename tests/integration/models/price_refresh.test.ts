import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import {
  createRun,
  executeRun,
  resumeRun,
  runSummary,
} from "models/price_refresh";
import { collectPrice } from "models/price_collection";
import { NotFoundError, ServiceError } from "infra/errors";
import { createStorePersistence } from "models/external_import/persistence";
jest.mock("models/price_collection", () => ({ collectPrice: jest.fn() }));

beforeEach(async () => {
  // This suite requires the normal disposable integration-test database.
  await prisma.priceRefreshRun.deleteMany();
  await prisma.game.deleteMany();
  jest.resetAllMocks();
});
afterAll(() => prisma.$disconnect());
async function seed() {
  return prisma.game.create({
    data: {
      title: "Editorial title",
      slug: randomUUID(),
      description: "Keep this",
      detailed_description: "Keep details",
      price: 77,
      base_price: 80,
      developer_name: "Fixture",
      steam_app_id: "990000100",
      status: "ACTIVE",
      media: { banner: "https://example.test/banner.jpg" },
    },
  });
}
function offer(country: string, amount = "10", captured_at = new Date()) {
  return {
    amount,
    original_amount: "20",
    discount_percent: 50,
    currency: country === "BR" ? "BRL" : "USD",
    expires_at: null,
    url: "https://store.steampowered.com/app/990000100/",
    captured_at,
  };
}

test("transient provider failure retries three times while another region succeeds", async () => {
  await seed();
  jest.mocked(collectPrice).mockImplementation(async (ref) => {
    if (ref.country === "BR") throw new ServiceError({ context: "HTTP_503" });
    return offer(ref.country);
  });
  const { run } = await createRun();
  await executeRun(run.id);
  expect(collectPrice).toHaveBeenCalledTimes(4);
  const failed = await prisma.priceRefreshItem.findFirst({
    where: { run_id: run.id, country: "BR" },
  });
  expect(failed.attempts).toBe(3);
  expect(failed.status).toBe("FAILED");
  expect((await runSummary(run.id)).counts.CHANGED).toBe(1);
});

test("a worker that loses its lease cannot commit an in-flight price", async () => {
  await seed();
  const { run } = await createRun();
  jest.mocked(collectPrice).mockImplementation(async (ref) => {
    await prisma.priceRefreshRun.update({
      where: { id: run.id },
      data: {
        lease_token: "replacement",
        lease_until: new Date(Date.now() + 60000),
      },
    });
    return offer(ref.country);
  });
  await expect(executeRun(run.id)).rejects.toThrow("PRICE_LEASE_LOST");
  expect(await prisma.gameExternalOffer.count()).toBe(0);
  expect(
    (await prisma.priceRefreshRun.findUnique({ where: { id: run.id } }))
      .lease_token,
  ).toBe("replacement");
});
test("duplicate starts converge; price-only refresh preserves editorial fields and local prices", async () => {
  const game = await seed();
  const attemptsBefore = await prisma.steamImportAttempt.count();
  jest
    .mocked(collectPrice)
    .mockImplementation(async (ref) => offer(ref.country));
  const starts = await Promise.all([createRun(), createRun()]);
  expect(starts[0].run.id).toBe(starts[1].run.id);
  await executeRun(starts[0].run.id);
  expect(await runSummary(starts[0].run.id)).toMatchObject({
    status: "COMPLETED",
    total: 2,
    checked: 2,
    counts: { CHANGED: 2 },
  });
  const saved = await prisma.game.findUnique({ where: { id: game.id } });
  expect(saved.title).toBe(game.title);
  expect(saved.media).toEqual(game.media);
  expect(saved.description).toBe(game.description);
  expect(saved.status).toBe("ACTIVE");
  expect(saved.price.toString()).toBe("77");
  expect(saved.base_price.toString()).toBe("80");
  expect(saved.steam_price.toString()).toBe("10");
  expect(saved.steam_price_currency).toBe("USD");
  expect(await prisma.steamImportAttempt.count()).toBe(attemptsBefore);
});
test("partial failure preserves existing prices and retry only visits failed regions", async () => {
  const game = await seed();
  await prisma.gameExternalOffer.create({
    data: {
      ...offer("BR", "5", new Date("2020-01-01")),
      game_id: game.id,
      provider: "STEAM",
      country: "BR",
    },
  });
  jest.mocked(collectPrice).mockImplementation(async (ref) => {
    if (ref.country === "BR") throw new NotFoundError({});
    return offer(ref.country);
  });
  const { run } = await createRun();
  await executeRun(run.id);
  expect((await runSummary(run.id)).status).toBe("COMPLETED_WITH_ERRORS");
  const old = await prisma.gameExternalOffer.findFirst({
    where: { country: "BR" },
  });
  expect(old.amount.toString()).toBe("5");
  expect(old.captured_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  jest
    .mocked(collectPrice)
    .mockClear()
    .mockImplementation(async (ref) => offer(ref.country));
  await resumeRun(run.id, true);
  await executeRun(run.id);
  expect(collectPrice).toHaveBeenCalledTimes(1);
  expect((await runSummary(run.id)).status).toBe("COMPLETED");
});
test("unknown price is skipped without making the last capture newer", async () => {
  const game = await seed();
  await prisma.gameExternalOffer.create({
    data: {
      ...offer("US", "5", new Date("2020-01-01")),
      game_id: game.id,
      provider: "STEAM",
      country: "US",
    },
  });
  jest.mocked(collectPrice).mockResolvedValue(null);
  const { run } = await createRun();
  await executeRun(run.id);
  expect((await runSummary(run.id)).counts.SKIPPED).toBe(2);
  expect(
    (await prisma.gameExternalOffer.findFirst()).captured_at.toISOString(),
  ).toBe("2020-01-01T00:00:00.000Z");
});
test("stopped work resumes pending items, expired leases can be reclaimed", async () => {
  await seed();
  jest
    .mocked(collectPrice)
    .mockImplementation(async (ref) => offer(ref.country));
  const { run } = await createRun();
  await executeRun(run.id, { shouldStop: () => true });
  expect((await runSummary(run.id)).status).toBe("INTERRUPTED");
  await prisma.priceRefreshRun.update({
    where: { id: run.id },
    data: {
      status: "RUNNING",
      lease_token: "abandoned",
      lease_until: new Date("2020-01-01"),
    },
  });
  expect((await runSummary(run.id)).stale).toBe(true);
  await executeRun(run.id);
  expect((await runSummary(run.id)).status).toBe("COMPLETED");
});
test("live worker cannot be resumed or executed by another caller", async () => {
  await seed();
  const { run } = await createRun();
  await prisma.priceRefreshRun.update({
    where: { id: run.id },
    data: {
      status: "RUNNING",
      lease_token: "live",
      lease_until: new Date(Date.now() + 60000),
    },
  });
  expect((await resumeRun(run.id, true)).resumed).toBe(false);
  await executeRun(run.id);
  expect(collectPrice).not.toHaveBeenCalled();
});

test("duplicate resume requests dispatch only once", async () => {
  await seed();
  const { run } = await createRun();
  await prisma.priceRefreshRun.update({
    where: { id: run.id },
    data: { status: "DISPATCH_FAILED" },
  });
  const results = await Promise.all([resumeRun(run.id), resumeRun(run.id)]);
  expect(results.filter((result) => result.resumed)).toHaveLength(1);
});
test("newer captures survive a delayed worker response and full reimport", async () => {
  const game = await seed();
  const newer = new Date("2030-01-01"),
    older = new Date("2020-01-01");
  await prisma.gameExternalOffer.create({
    data: {
      ...offer("US", "15", newer),
      game_id: game.id,
      provider: "STEAM",
      country: "US",
    },
  });
  jest
    .mocked(collectPrice)
    .mockImplementation(async (ref) => offer(ref.country, "10", older));
  const { run } = await createRun();
  await executeRun(run.id);
  expect(
    (
      await prisma.gameExternalOffer.findFirst({ where: { country: "US" } })
    ).amount.toString(),
  ).toBe("15");
  const persist = createStorePersistence({
    source: "STEAM",
    identity: (steam_app_id) => ({ steam_app_id }),
    canRefresh: () => true,
    fallbackLocales: [],
    fallbackOnRefresh: false,
    createUnknownOffersOnRefresh: false,
  });
  await prisma.$transaction((tx) =>
    persist(tx, {
      externalId: game.steam_app_id,
      suggestedSlug: game.slug,
      fields: {
        title: game.title,
        description: game.description,
        detailed_description: game.detailed_description,
        developer_name: game.developer_name,
        media: {},
        meta_tags: {},
      },
      localizations: [],
      offers: [{ ...offer("US", "2", older), country: "US" }],
    }),
  );
  expect(
    (
      await prisma.gameExternalOffer.findFirst({ where: { country: "US" } })
    ).amount.toString(),
  ).toBe("15");
});
