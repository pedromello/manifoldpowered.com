import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import type { EmailGiftProduct, EmailGiftProvider } from "infra/gift_card_api";
import {
  giftCardProducts,
  syncGiftCardCatalog,
} from "models/gift_card_catalog";

const original = { ...process.env };
const prefix = `catalog-fixture-${randomUUID()}`;
let ownsCatalog = false;

function product(suffix: string, amount_minor = 2500): EmailGiftProduct {
  return {
    sku: `${prefix}-${suffix}`,
    name: `Synthetic ${suffix}`,
    amount_minor,
    currency: "BRL",
    provider_cost_minor: 2300,
  };
}
function provider(products: EmailGiftProduct[]): EmailGiftProvider {
  return {
    products: jest.fn().mockResolvedValue(products),
    submit: jest.fn(),
    track: jest.fn(),
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  // Catalog synchronization has a singleton lease and updates the complete
  // catalog. Refuse existing inventory instead of altering unrelated fixtures.
  const [products, sync] = await Promise.all([
    prisma.giftCardProduct.count(),
    prisma.giftCardCatalogSync.findUnique({ where: { id: "catalog" } }),
  ]);
  if (products || sync)
    throw new Error(
      "Catalog integration tests require empty catalog tables in an isolated database.",
    );
  ownsCatalog = true;
});
beforeEach(() => {
  process.env.GIFT_CARD_PROVIDER = "api";
  process.env.PAYMENT_ENVIRONMENT = "sandbox";
});
afterEach(async () => {
  process.env = { ...original };
  if (!ownsCatalog) return;
  await prisma.giftCardProduct.deleteMany({
    where: { provider_sku: { startsWith: prefix } },
  });
  await prisma.giftCardCatalogSync.deleteMany({ where: { id: "catalog" } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("catalog refresh preserves publication selection and withdraws missing inventory", async () => {
  const first = product("first"),
    second = product("second", 5000);
  await expect(syncGiftCardCatalog(provider([first, second]))).resolves.toBe(2);
  const initial = await prisma.giftCardProduct.findMany({
    orderBy: { name: "asc" },
  });
  expect(initial).toHaveLength(2);
  expect(initial.every((item) => !item.enabled && item.available)).toBe(true);
  const selected = initial.find((item) => item.provider_sku === first.sku)!;
  await prisma.giftCardProduct.update({
    where: { code: selected.code },
    data: { enabled: true },
  });

  await syncGiftCardCatalog(
    provider([
      { ...first, name: "Synthetic updated name", provider_cost_minor: 2200 },
    ]),
  );
  expect(
    await prisma.giftCardProduct.findUniqueOrThrow({
      where: { code: selected.code },
    }),
  ).toMatchObject({
    enabled: true,
    available: true,
    name: "Synthetic updated name",
    amount_minor: 2500,
    provider_cost_minor: 2200,
  });
  expect(
    await prisma.giftCardProduct.findFirstOrThrow({
      where: { provider_sku: second.sku },
    }),
  ).toMatchObject({ enabled: false, available: false });
  expect(await giftCardProducts()).toEqual([
    {
      code: selected.code,
      name: "Synthetic updated name",
      amount_minor: 2500,
      currency: "BRL",
    },
  ]);
  expect(
    await prisma.giftCardCatalogSync.findUniqueOrThrow({
      where: { id: "catalog" },
    }),
  ).toMatchObject({
    last_success_at: expect.any(Date),
    last_error: null,
    claim_token: null,
    claim_until: null,
  });
});

test("a changed denomination creates unpublished inventory and preserves the old product snapshot", async () => {
  const first = product("denomination");
  await syncGiftCardCatalog(provider([first]));
  const old = await prisma.giftCardProduct.findFirstOrThrow({
    where: { provider_sku: first.sku },
  });
  await prisma.giftCardProduct.update({
    where: { code: old.code },
    data: { enabled: true },
  });
  await syncGiftCardCatalog(provider([{ ...first, amount_minor: 5000 }]));
  const current = await prisma.giftCardProduct.findFirstOrThrow({
    where: { provider_sku: first.sku, available: true },
  });
  expect(current).toMatchObject({ enabled: false, amount_minor: 5000 });
  expect(current.code).not.toBe(old.code);
  expect(
    await prisma.giftCardProduct.findUniqueOrThrow({
      where: { code: old.code },
    }),
  ).toMatchObject({ enabled: true, available: false, amount_minor: 2500 });
  expect(await giftCardProducts()).toEqual([]);
});

test("a failed refresh keeps the entire previous catalog and its successful timestamp", async () => {
  const first = product("preserved"),
    second = product("unchanged", 5000);
  await syncGiftCardCatalog(provider([first, second]));
  const snapshot = await prisma.giftCardProduct.findMany({
    orderBy: { code: "asc" },
  });
  const receipt = await prisma.giftCardCatalogSync.findUniqueOrThrow({
    where: { id: "catalog" },
  });
  // This causes a real PostgreSQL constraint failure after earlier writes in
  // the refresh transaction, exercising rollback rather than only validation.
  const failed = provider([
    { ...first, name: "Synthetic attempted change" },
    { ...product("invalid"), name: "x".repeat(201) },
  ]);
  await expect(syncGiftCardCatalog(failed)).rejects.toThrow(
    "The previous catalog was preserved.",
  );
  expect(
    await prisma.giftCardProduct.findMany({ orderBy: { code: "asc" } }),
  ).toEqual(snapshot);
  expect(
    await prisma.giftCardCatalogSync.findUniqueOrThrow({
      where: { id: "catalog" },
    }),
  ).toMatchObject({
    last_success_at: receipt.last_success_at,
    last_error: "CATALOG_SYNC_FAILED",
    claim_token: null,
    claim_until: null,
  });
});

test("concurrent synchronization cannot fetch twice or steal a live lease", async () => {
  const started = deferred(),
    finish = deferred();
  const first = provider([product("concurrent")]);
  (first.products as jest.Mock).mockImplementation(async () => {
    started.resolve();
    await finish.promise;
    return [product("concurrent")];
  });
  const running = syncGiftCardCatalog(first);
  await started.promise;
  try {
    const lease = await prisma.giftCardCatalogSync.findUniqueOrThrow({
      where: { id: "catalog" },
    });
    const competing = provider([product("competing")]);
    await expect(syncGiftCardCatalog(competing)).rejects.toThrow(
      "Catalog synchronization is already running.",
    );
    expect(competing.products).not.toHaveBeenCalled();
    expect(
      await prisma.giftCardCatalogSync.findUniqueOrThrow({
        where: { id: "catalog" },
      }),
    ).toMatchObject({
      claim_token: lease.claim_token,
      claim_until: lease.claim_until,
    });
  } finally {
    finish.resolve();
    await running;
  }
  expect(first.products).toHaveBeenCalledTimes(1);
  expect(await prisma.giftCardProduct.count()).toBe(1);
});

test("an expired synchronization lease is recoverable after a process restart", async () => {
  await prisma.giftCardCatalogSync.create({
    data: {
      id: "catalog",
      claim_token: "synthetic-expired-process",
      claim_until: new Date(Date.now() - 1000),
    },
  });
  await expect(
    syncGiftCardCatalog(provider([product("restart")])),
  ).resolves.toBe(1);
  expect(
    await prisma.giftCardCatalogSync.findUniqueOrThrow({
      where: { id: "catalog" },
    }),
  ).toMatchObject({
    last_success_at: expect.any(Date),
    claim_token: null,
    claim_until: null,
  });
});
