import orchestrator from "tests/orchestrator";
import library from "models/library";
import ledger from "models/ledger";
import commercialTerms from "models/commercial_terms";
import { prisma } from "infra/database";
import { Prisma } from "generated/prisma/client";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

// A game priced at exactly 100 makes every share readable at a glance:
// 70 supplier, 10 commission, 20 platform.
async function seedGame(price = 100) {
  const developer = await orchestrator.createUser();
  const game = await orchestrator.createGame(developer.id, { price });
  return gameModel.makePublic(game.id);
}

async function seedOutlet() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  return { owner, store };
}

function amountOf(
  entries: Array<{ account_type: string; amount: Prisma.Decimal }>,
  accountType: string,
) {
  return entries
    .find((entry) => entry.account_type === accountType)
    ?.amount.toFixed(4);
}

describe("library.acquireGame() ledger entries", () => {
  test("writes a four-entry set that sums to zero", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    await library.acquireGame(buyer.id, game.slug, store.slug);

    const sale = await prisma.sale.findFirstOrThrow();
    const entries = await ledger.findBySource("SALE", sale.id);

    expect(entries).toHaveLength(4);
    expect(amountOf(entries, "CONSUMER_PAYMENT")).toBe("100.0000");
    expect(amountOf(entries, "SUPPLIER_COST")).toBe("-70.0000");
    expect(amountOf(entries, "AFFILIATE_COMMISSION")).toBe("-10.0000");
    expect(amountOf(entries, "PLATFORM_REVENUE")).toBe("-20.0000");

    const totals = ledger.sumByCurrency(entries);
    expect(totals.get("USD")?.toFixed(4)).toBe("0.0000");
  });

  test("attributes the commission to the outlet owner", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    await library.acquireGame(buyer.id, game.slug, store.slug);

    const payable = await ledger.maturedPayableBalancesFor("STORE", store.id, {
      matured_as_of: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
    });

    expect(payable[0].currency).toBe("USD");
    expect(payable[0].amount.toFixed(4)).toBe("10.0000");
  });

  // The hold is the platform's chargeback defence, so a commission must not be
  // payable the moment it is earned.
  test("holds the commission rather than making it immediately payable", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    await library.acquireGame(buyer.id, game.slug, store.slug);

    expect(await ledger.maturedPayableBalancesFor("STORE", store.id)).toEqual(
      [],
    );
  });

  test("uses the outlet's own commission rate when one is set", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    await orchestrator.setStoreCommissionRate(store.id, 0.25);
    await library.acquireGame(buyer.id, game.slug, store.slug);

    const sale = await prisma.sale.findFirstOrThrow();
    const entries = await ledger.findBySource("SALE", sale.id);

    expect(amountOf(entries, "AFFILIATE_COMMISSION")).toBe("-25.0000");
    // The platform absorbs the difference, so the set still balances.
    expect(amountOf(entries, "PLATFORM_REVENUE")).toBe("-5.0000");
    expect(ledger.sumByCurrency(entries).get("USD")?.isZero()).toBe(true);
  });

  test("uses the supplier's own cost rate when terms exist", async () => {
    const developer = await orchestrator.createUser();
    const game = await orchestrator.createGame(developer.id, { price: 100 });
    await gameModel.makePublic(game.id);
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    await orchestrator.setSupplierTerms({
      supplier_id: game.studio_id,
      cost_rate: 0.5,
    });

    await library.acquireGame(buyer.id, game.slug, store.slug);

    const sale = await prisma.sale.findFirstOrThrow();
    const entries = await ledger.findBySource("SALE", sale.id);

    expect(amountOf(entries, "SUPPLIER_COST")).toBe("-50.0000");
    expect(amountOf(entries, "PLATFORM_REVENUE")).toBe("-40.0000");
    expect(ledger.sumByCurrency(entries).get("USD")?.isZero()).toBe(true);
  });

  // The majority of sales at launch: no store attribution, so no commission
  // and the platform keeps the whole margin.
  test("writes a three-entry set when there is no outlet", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();

    await library.acquireGame(buyer.id, game.slug);

    const sale = await prisma.sale.findFirstOrThrow();
    const entries = await ledger.findBySource("SALE", sale.id);

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.account_type).sort()).toEqual([
      "CONSUMER_PAYMENT",
      "PLATFORM_REVENUE",
      "SUPPLIER_COST",
    ]);
    expect(amountOf(entries, "PLATFORM_REVENUE")).toBe("-30.0000");
    expect(ledger.sumByCurrency(entries).get("USD")?.isZero()).toBe(true);
  });

  test("ignores an unknown outlet slug rather than failing", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();

    await library.acquireGame(buyer.id, game.slug, "no-such-outlet");

    const sale = await prisma.sale.findFirstOrThrow();

    expect(sale.store_id).toBeNull();
    expect(await ledger.findBySource("SALE", sale.id)).toHaveLength(3);
  });

  test("ignores a draft Outlet slug rather than attributing a private Outlet", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const draft = await orchestrator.createStore(owner.id, { draft: true });

    await library.acquireGame(buyer.id, game.slug, draft.slug);

    const sale = await prisma.sale.findFirstOrThrow();
    expect(sale.store_id).toBeNull();
    expect(await ledger.findBySource("SALE", sale.id)).toHaveLength(3);
  });

  // The outlet is the payee, so who owns it is irrelevant to the money. This
  // used to drop the attribution entirely, because a commission had to name a
  // user the ledger could find.
  test("still earns when the outlet's owner no longer exists", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { owner, store } = await seedOutlet();

    await prisma.user.delete({ where: { id: owner.id } });

    await library.acquireGame(buyer.id, game.slug, store.slug);

    const sale = await prisma.sale.findFirstOrThrow();

    expect(sale.store_id).toBe(store.id);
    expect(await ledger.findBySource("SALE", sale.id)).toHaveLength(4);
    expect((await ledger.balanceFor("STORE", store.id, "USD")).toFixed(4)).toBe(
      "-10.0000",
    );
  });

  // The point of the whole re-scoping: the balance belongs to the outlet, so a
  // change of hands moves nothing. A payout still goes to the account
  // registered against the outlet.
  test("keeps the balance with the outlet when it changes owner", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    await library.acquireGame(buyer.id, game.slug, store.slug);

    const newOwner = await orchestrator.createUser();
    await prisma.store.update({
      where: { id: store.id },
      data: { owner_id: newOwner.id },
    });

    expect((await ledger.balanceFor("STORE", store.id, "USD")).toFixed(4)).toBe(
      "-10.0000",
    );
  });

  // A Sale records an acquisition *event*, deliberately — see the comment on
  // the model. The entitlement is idempotent; the sale is not, so an outlet
  // that refers the same buyer again keeps its attribution.
  describe("repeat acquisition", () => {
    // Documents current behaviour rather than endorsing it. Whether a repeat
    // through the SAME outlet should earn a second time is an open product
    // decision: it is the cheapest way for an outlet owner to farm their own
    // commission, and today only the 30-day hold and the payout threshold
    // discourage it.
    test("records another sale and another commission each time", async () => {
      const game = await seedGame();
      const buyer = await orchestrator.createUser();
      const { store } = await seedOutlet();

      await library.acquireGame(buyer.id, game.slug, store.slug);
      await library.acquireGame(buyer.id, game.slug, store.slug);

      expect(await prisma.sale.count()).toBe(2);
      expect(await prisma.ledgerEntry.count()).toBe(8);
      expect(
        (await ledger.balanceFor("STORE", store.id, "USD")).toFixed(4),
      ).toBe("-20.0000");
    });

    test("keeps the entitlement a single row", async () => {
      const game = await seedGame();
      const buyer = await orchestrator.createUser();

      const first = await library.acquireGame(buyer.id, game.slug);
      const second = await library.acquireGame(buyer.id, game.slug);

      expect(second?.id).toBe(first?.id);
      expect(await prisma.libraryItem.count()).toBe(1);
    });

    // The reason the sale is not deduplicated: each outlet keeps the
    // attribution for the acquisition it referred.
    test("attributes a second outlet's referral to that outlet", async () => {
      const game = await seedGame();
      const buyer = await orchestrator.createUser();
      const first = await seedOutlet();
      const second = await seedOutlet();

      await library.acquireGame(buyer.id, game.slug, first.store.slug);
      await library.acquireGame(buyer.id, game.slug, second.store.slug);

      expect(
        (await ledger.balanceFor("STORE", first.store.id, "USD")).toFixed(4),
      ).toBe("-10.0000");
      expect(
        (await ledger.balanceFor("STORE", second.store.id, "USD")).toFixed(4),
      ).toBe("-10.0000");
    });

    test("keeps every set balanced across repeated acquisitions", async () => {
      const game = await seedGame();
      const buyer = await orchestrator.createUser();
      const { store } = await seedOutlet();

      await library.acquireGame(buyer.id, game.slug, store.slug);
      await library.acquireGame(buyer.id, game.slug, store.slug);

      const totals = await prisma.ledgerEntry.groupBy({
        by: ["currency"],
        _sum: { amount: true },
      });

      expect(totals).toHaveLength(1);
      expect(totals[0]._sum.amount?.toFixed(4)).toBe("0.0000");
    });
  });

  describe("rounding", () => {
    // 33.33 × 0.7 = 23.331, and × 0.1 = 3.333. Both quantise, and the platform
    // absorbs whatever the rounding leaves so the set still nets to zero.
    test("keeps a set balanced when the shares do not divide evenly", async () => {
      const game = await seedGame(33.33);
      const buyer = await orchestrator.createUser();
      const { store } = await seedOutlet();

      await library.acquireGame(buyer.id, game.slug, store.slug);

      const sale = await prisma.sale.findFirstOrThrow();
      const entries = await ledger.findBySource("SALE", sale.id);

      expect(amountOf(entries, "CONSUMER_PAYMENT")).toBe("33.3300");
      expect(amountOf(entries, "SUPPLIER_COST")).toBe("-23.3310");
      expect(amountOf(entries, "AFFILIATE_COMMISSION")).toBe("-3.3330");
      expect(amountOf(entries, "PLATFORM_REVENUE")).toBe("-6.6660");
      expect(ledger.sumByCurrency(entries).get("USD")?.isZero()).toBe(true);
    });

    // A supplier rate this high leaves nothing for the platform once the
    // affiliate is paid. The ledger records the loss rather than refusing the
    // sale — it records facts, and the fix is a commercial one.
    test("records a negative platform revenue rather than hiding it", async () => {
      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });
      await gameModel.makePublic(game.id);
      const buyer = await orchestrator.createUser();
      const { store } = await seedOutlet();

      await orchestrator.setSupplierTerms({
        supplier_id: game.studio_id,
        cost_rate: 0.95,
      });

      await library.acquireGame(buyer.id, game.slug, store.slug);

      const sale = await prisma.sale.findFirstOrThrow();
      const entries = await ledger.findBySource("SALE", sale.id);

      // Negated on write, so a platform loss appears as a positive entry.
      expect(amountOf(entries, "PLATFORM_REVENUE")).toBe("5.0000");
      expect(ledger.sumByCurrency(entries).get("USD")?.isZero()).toBe(true);
    });
  });

  describe("currency", () => {
    test("records the sale in the currency the buyer was charged", async () => {
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({ rate: 5 });

      const game = await seedGame();
      const buyer = await orchestrator.createUser();
      const { store } = await seedOutlet();

      await library.acquireGame(buyer.id, game.slug, store.slug, "BRL");

      const sale = await prisma.sale.findFirstOrThrow();

      expect(sale.currency).toBe("BRL");
      expect(sale.price_at_sale.toFixed(2)).toBe("500.00");
      expect(sale.exchange_rate?.toFixed(8)).toBe("5.00000000");
    });

    // The rate snapshot has to reach the entries too, or a converted sale
    // cannot be reconciled against the rate that produced it.
    test("carries the currency and rate onto every entry", async () => {
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({ rate: 5 });

      const game = await seedGame();
      const buyer = await orchestrator.createUser();
      const { store } = await seedOutlet();

      await library.acquireGame(buyer.id, game.slug, store.slug, "BRL");

      const sale = await prisma.sale.findFirstOrThrow();
      const entries = await ledger.findBySource("SALE", sale.id);

      for (const entry of entries) {
        expect(entry.currency).toBe("BRL");
        expect(entry.exchange_rate?.toFixed(8)).toBe("5.00000000");
        expect(entry.exchange_rate_from_currency).toBe("USD");
      }

      expect(amountOf(entries, "AFFILIATE_COMMISSION")).toBe("-50.0000");
      expect(ledger.sumByCurrency(entries).get("BRL")?.isZero()).toBe(true);
    });

    // A game with no price in the visitor's currency is absent from listings
    // and 404s on its detail page; acquiring it has to agree.
    test("refuses to sell a game that has no price in that currency", async () => {
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const game = await seedGame();
      const buyer = await orchestrator.createUser();

      await expect(
        library.acquireGame(buyer.id, game.slug, undefined, "BRL"),
      ).rejects.toMatchObject({ name: "NotFoundError", statusCode: 404 });

      expect(await prisma.sale.count()).toBe(0);
      expect(await prisma.ledgerEntry.count()).toBe(0);
    });
  });

  // The books and the thing they describe must not be able to disagree.
  test("writes no ledger entries when the sale itself fails", async () => {
    const game = await seedGame();
    const buyer = await orchestrator.createUser();
    const { store } = await seedOutlet();

    // An integration supplier with no terms throws while the entries are being
    // assembled, after the library item and sale rows have been created.
    jest
      .spyOn(commercialTerms, "supplierCostRateFor")
      .mockRejectedValueOnce(new Error("no terms"));

    await expect(
      library.acquireGame(buyer.id, game.slug, store.slug),
    ).rejects.toThrow();

    expect(await prisma.sale.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.libraryItem.count()).toBe(0);
    expect((await ledger.balanceFor("STORE", store.id, "USD")).isZero()).toBe(
      true,
    );

    jest.restoreAllMocks();
  });
});
