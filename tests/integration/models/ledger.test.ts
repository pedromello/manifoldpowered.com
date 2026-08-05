import { randomUUID } from "node:crypto";
import orchestrator from "tests/orchestrator";
import ledger from "models/ledger";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

const DAY_IN_MS = 24 * 60 * 60 * 1000;

async function registerBaseCurrencies() {
  await orchestrator.clearDatabaseRows();
  await orchestrator.createCurrency({ code: "USD", symbol: "$" });
  await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
}

// Entries within a set share one created_at, so they come back in id order.
// Assertions name the account they mean rather than an index.
function amountOf(
  entries: Array<{
    account_type: string;
    amount: { toFixed: (n: number) => string };
  }>,
  accountType: string,
) {
  return entries
    .find((entry) => entry.account_type === accountType)
    ?.amount.toFixed(4);
}

// A payee is an outlet, not a person: the outlet holds the balance and the
// payout account, so a commission survives it changing hands.
async function createOutlet() {
  const owner = await orchestrator.createUser();
  return await orchestrator.createStore(owner.id);
}

// A balanced two-entry set, the smallest thing the ledger will accept.
function balancedPair(amount: number, currencyCode = "USD") {
  return [
    {
      account_type: "CONSUMER_PAYMENT" as const,
      amount,
      currency: currencyCode,
    },
    {
      account_type: "PLATFORM_REVENUE" as const,
      amount: -amount,
      currency: currencyCode,
    },
  ];
}

describe("models/ledger.ts", () => {
  describe(".record()", () => {
    test("writes every entry in a balanced set under one group id", async () => {
      await registerBaseCurrencies();

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100),
      });

      expect(entries).toHaveLength(2);
      expect(entries[0].entry_group_id).toBe(entries[1].entry_group_id);
      expect(entries[0].amount.toFixed(4)).toBe("100.0000");
      expect(entries[1].amount.toFixed(4)).toBe("-100.0000");
      expect(entries[0].created_at).toBeInstanceOf(Date);
    });

    test("stores the fields a sale entry carries", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const saleId = randomUUID();
      const maturesAt = new Date("2026-09-30T00:00:00.000Z");

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: saleId,
        entries: [
          {
            account_type: "CONSUMER_PAYMENT",
            amount: 100,
            currency: "USD",
            description: "Gross payment",
          },
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: -100,
            currency: "USD",
            matures_at: maturesAt,
          },
        ],
      });

      const commission = entries.find(
        (entry) => entry.account_type === "AFFILIATE_COMMISSION",
      );

      expect(commission?.owner_id).toBe(affiliate.id);
      expect(commission?.source_type).toBe("SALE");
      expect(commission?.source_id).toBe(saleId);
      expect(commission?.matures_at?.toISOString()).toBe(
        "2026-09-30T00:00:00.000Z",
      );

      const payment = entries.find(
        (entry) => entry.account_type === "CONSUMER_PAYMENT",
      );

      expect(payment?.owner_id).toBeNull();
      expect(payment?.description).toBe("Gross payment");
      expect(payment?.matures_at).toBeNull();
    });

    test("keeps the full 4-decimal scale", async () => {
      await registerBaseCurrencies();

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(0.0001),
      });

      expect(entries[0].amount.toFixed(4)).toBe("0.0001");
      expect(entries[1].amount.toFixed(4)).toBe("-0.0001");
    });

    test("normalizes the currency code to uppercase", async () => {
      await registerBaseCurrencies();

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100, "brl"),
      });

      expect(entries.map((entry) => entry.currency)).toEqual(["BRL", "BRL"]);
    });

    // The invariant this whole model exists for.
    test("rejects a set that does not sum to zero", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
            { account_type: "SUPPLIER_COST", amount: -70, currency: "USD" },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message:
          "Ledger entries must sum to zero within each currency, but this set left USD 30.0000.",
        action:
          "Add the missing entries so every currency in the set nets to zero, and try again.",
        statusCode: 400,
      });
    });

    test("writes nothing when the set is unbalanced", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
            { account_type: "SUPPLIER_COST", amount: -70, currency: "USD" },
          ],
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });

      expect(await prisma.ledgerEntry.count()).toBe(0);
    });

    // Each currency has to balance on its own. A set that nets to zero only
    // when the two are added together is not balanced.
    test("rejects a set that balances only across currencies", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
            { account_type: "PLATFORM_REVENUE", amount: -100, currency: "BRL" },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message:
          "Ledger entries must sum to zero within each currency, but this set left USD 100.0000, BRL -100.0000.",
      });
    });

    test("accepts a multi-currency set where each currency balances", async () => {
      await registerBaseCurrencies();

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: [...balancedPair(100, "USD"), ...balancedPair(550, "BRL")],
      });

      expect(entries).toHaveLength(4);
    });

    // Rounding at write time could turn a set that validated as balanced into
    // one that lands unbalanced, so extra scale is refused rather than trimmed.
    test("rejects an amount with more than 4 decimal places", async () => {
      await registerBaseCurrencies();

      const rejected = ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(1.00005),
      });

      await expect(rejected).rejects.toMatchObject({
        name: "ValidationError",
        message: "One or more ledger entries are invalid",
        action: "Check the fields and try again",
        statusCode: 400,
      });
    });

    test("rejects a zero amount", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 0, currency: "USD" },
            { account_type: "PLATFORM_REVENUE", amount: 0, currency: "USD" },
          ],
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    test("rejects a single-entry set", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
          ],
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    test("rejects an unknown source type", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          // @ts-expect-error deliberately outside the allowed source types
          source_type: "INVOICE",
          source_id: randomUUID(),
          entries: balancedPair(100),
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    test("rejects an unregistered currency", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: balancedPair(100, "JPY"),
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: "The following currencies are not registered: JPY.",
        action: "Register the currency before recording ledger entries in it.",
        statusCode: 400,
      });
    });

    // models/pricing lets the platform sell in USD before any currency row
    // exists. If the ledger disagreed, an unconfigured install could not record
    // a single sale.
    test("accepts the base currency when no currency is registered", async () => {
      await orchestrator.clearDatabaseRows();

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100, "USD"),
      });

      expect(entries).toHaveLength(2);
    });

    // Disabling a currency stops us pricing in it. It does not un-happen the
    // sales already made in it.
    test("accepts a registered but disabled currency", async () => {
      await registerBaseCurrencies();
      await orchestrator.createCurrency({
        code: "EUR",
        symbol: "€",
        enabled: false,
      });

      const entries = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100, "EUR"),
      });

      expect(entries).toHaveLength(2);
    });
  });

  // Which accounts may name a user. An unowned account naming an affiliate
  // would be a record asserting a storefront owner received consumer funds,
  // which is the fact the affiliate characterisation depends on never being
  // true. An owned account with no owner is a liability owed to nobody.
  describe(".record() ownership rules", () => {
    test("rejects a platform account that names a user", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            {
              account_type: "CONSUMER_PAYMENT",
              owner_type: "STORE",
              owner_id: affiliate.id,
              amount: 100,
              currency: "USD",
            },
            { account_type: "PLATFORM_REVENUE", amount: -100, currency: "USD" },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message:
          "A CONSUMER_PAYMENT entry is a platform account and must not name an owner.",
        action: "Remove owner_type and owner_id from this entry and try again.",
        statusCode: 400,
      });
    });

    test("rejects a commission that names nobody", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
            {
              account_type: "AFFILIATE_COMMISSION",
              amount: -100,
              currency: "USD",
            },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message:
          "A AFFILIATE_COMMISSION entry must name the owner it belongs to.",
        action: "Set owner_type and owner_id on this entry and try again.",
        statusCode: 400,
      });
    });

    // No foreign keys, so an owner id matching no user would become a
    // commission that never surfaces in any statement or payout.
    // An id with no type matches no balance query, so the row would sit in the
    // books owed to nobody findable.
    test("rejects an owner id with no owner type", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
            {
              account_type: "AFFILIATE_COMMISSION",
              owner_id: randomUUID(),
              amount: -100,
              currency: "USD",
            },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: "One or more ledger entries are invalid",
        statusCode: 400,
      });
    });

    test("rejects an owner that does not exist", async () => {
      await registerBaseCurrencies();

      const missingId = randomUUID();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: [
            { account_type: "CONSUMER_PAYMENT", amount: 100, currency: "USD" },
            {
              account_type: "AFFILIATE_COMMISSION",
              owner_type: "STORE",
              owner_id: missingId,
              amount: -100,
              currency: "USD",
            },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: `The following ledger entry owners do not exist: ${missingId}.`,
        action: "Check the owner_id of each entry and try again.",
        statusCode: 400,
      });
    });

    // The majority of sales at launch: Sale.store_id is nullable, and null
    // means the purchase came through the global storefront with no affiliate.
    test("records a sale with no affiliate as a three-entry set", async () => {
      await registerBaseCurrencies();

      const saleId = randomUUID();
      const entries = await orchestrator.recordLedgerSale({
        source_id: saleId,
      });

      expect(entries).toHaveLength(3);
      expect(entries.map((entry) => entry.account_type).sort()).toEqual([
        "CONSUMER_PAYMENT",
        "PLATFORM_REVENUE",
        "SUPPLIER_COST",
      ]);

      // The whole margin stays with the platform when nobody referred the sale.
      const revenue = entries.find(
        (entry) => entry.account_type === "PLATFORM_REVENUE",
      );
      expect(revenue?.amount.toFixed(4)).toBe("-30.0000");
    });
  });

  describe(".record() bounds", () => {
    // Would otherwise overflow Decimal(19,4) and surface as a raw Postgres
    // error rather than something a caller can act on.
    test("rejects an amount beyond the storable range", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "SALE",
          source_id: randomUUID(),
          entries: balancedPair(1e15),
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    // The rate snapshot exists so a conversion can be reproduced later, which
    // a silently rounded rate would defeat.
    test("rejects a rate with more than 8 decimal places", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "ADJUSTMENT",
          source_id: randomUUID(),
          entries: [
            {
              account_type: "CONSUMER_PAYMENT",
              amount: 550,
              currency: "BRL",
              exchange_rate: "5.123456789012",
              exchange_rate_from_currency: "USD",
            },
            { account_type: "PLATFORM_REVENUE", amount: -550, currency: "BRL" },
          ],
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe(".record() with a conversion", () => {
    test("stores the rate and the currency it converted from", async () => {
      await registerBaseCurrencies();

      const entries = await ledger.record({
        source_type: "ADJUSTMENT",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "CONSUMER_PAYMENT",
            amount: 550,
            currency: "BRL",
            exchange_rate: 5.5,
            exchange_rate_from_currency: "USD",
          },
          {
            account_type: "PLATFORM_REVENUE",
            amount: -550,
            currency: "BRL",
            exchange_rate: 5.5,
            exchange_rate_from_currency: "USD",
          },
        ],
      });

      expect(entries[0].exchange_rate?.toFixed(8)).toBe("5.50000000");
      expect(entries[0].exchange_rate_from_currency).toBe("USD");
    });

    // A rate with no pair cannot be reconciled later, so the two are refused
    // unless they arrive together.
    test("rejects a rate without the currency it converted from", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "ADJUSTMENT",
          source_id: randomUUID(),
          entries: [
            {
              account_type: "CONSUMER_PAYMENT",
              amount: 550,
              currency: "BRL",
              exchange_rate: 5.5,
            },
            {
              account_type: "PLATFORM_REVENUE",
              amount: -550,
              currency: "BRL",
            },
          ],
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    test("rejects converting a currency into itself", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "ADJUSTMENT",
          source_id: randomUUID(),
          entries: [
            {
              account_type: "CONSUMER_PAYMENT",
              amount: 100,
              currency: "USD",
              exchange_rate: 1,
              exchange_rate_from_currency: "USD",
            },
            { account_type: "PLATFORM_REVENUE", amount: -100, currency: "USD" },
          ],
        }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    test("rejects an unregistered currency on the conversion side", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.record({
          source_type: "ADJUSTMENT",
          source_id: randomUUID(),
          entries: [
            {
              account_type: "CONSUMER_PAYMENT",
              amount: 550,
              currency: "BRL",
              exchange_rate: 5.5,
              exchange_rate_from_currency: "JPY",
            },
            { account_type: "PLATFORM_REVENUE", amount: -550, currency: "BRL" },
          ],
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: "The following currencies are not registered: JPY.",
      });
    });
  });

  describe(".reverse()", () => {
    test("writes the mirror image of the original set", async () => {
      await registerBaseCurrencies();

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100),
      });

      const reversal = await ledger.reverse(original[0].entry_group_id);

      expect(reversal).toHaveLength(2);
      expect(reversal[0].entry_group_id).not.toBe(original[0].entry_group_id);
      expect(amountOf(reversal, "CONSUMER_PAYMENT")).toBe("-100.0000");
      expect(amountOf(reversal, "PLATFORM_REVENUE")).toBe("100.0000");
    });

    test("leaves the original entries untouched", async () => {
      await registerBaseCurrencies();

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100),
      });

      await ledger.reverse(original[0].entry_group_id);

      const stillThere = await ledger.findByGroup(original[0].entry_group_id);

      expect(stillThere).toHaveLength(2);
      expect(amountOf(stillThere, "CONSUMER_PAYMENT")).toBe("100.0000");
    });

    test("names the entry each reversing row cancels", async () => {
      await registerBaseCurrencies();

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100),
      });

      const reversal = await ledger.reverse(original[0].entry_group_id);

      expect(reversal.map((entry) => entry.reverses_entry_id).sort()).toEqual(
        original.map((entry) => entry.id).sort(),
      );
    });

    test("keeps the original's source so both sets describe one event", async () => {
      await registerBaseCurrencies();

      const saleId = randomUUID();
      const original = await ledger.record({
        source_type: "SALE",
        source_id: saleId,
        entries: balancedPair(100),
      });

      await ledger.reverse(original[0].entry_group_id);

      const everything = await ledger.findBySource("SALE", saleId);

      expect(everything).toHaveLength(4);
    });

    // A null hold on the reversal would count it as immediately available
    // while the original was still held, so a matured-balance query would show
    // a commission as payable with nothing offsetting it.
    test("copies the original's matures_at", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const maturesAt = new Date(Date.now() + 30 * DAY_IN_MS);

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: [
          { account_type: "CONSUMER_PAYMENT", amount: 10, currency: "USD" },
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: -10,
            currency: "USD",
            matures_at: maturesAt,
          },
        ],
      });

      const reversal = await ledger.reverse(original[0].entry_group_id);

      const reversedCommission = reversal.find(
        (entry) => entry.account_type === "AFFILIATE_COMMISSION",
      );

      expect(reversedCommission?.matures_at?.toISOString()).toBe(
        maturesAt.toISOString(),
      );
    });

    test("carries the rate snapshot onto the reversal", async () => {
      await registerBaseCurrencies();

      const original = await ledger.record({
        source_type: "ADJUSTMENT",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "CONSUMER_PAYMENT",
            amount: 550,
            currency: "BRL",
            exchange_rate: 5.5,
            exchange_rate_from_currency: "USD",
          },
          {
            account_type: "PLATFORM_REVENUE",
            amount: -550,
            currency: "BRL",
            exchange_rate: 5.5,
            exchange_rate_from_currency: "USD",
          },
        ],
      });

      const reversal = await ledger.reverse(original[0].entry_group_id);

      expect(reversal[0].exchange_rate?.toFixed(8)).toBe("5.50000000");
      expect(reversal[0].exchange_rate_from_currency).toBe("USD");
    });

    test("nets the source to zero once reversed", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const sale = await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
      });

      await ledger.reverse(sale[0].entry_group_id);

      expect(
        (await ledger.balanceFor("STORE", affiliate.id, "USD")).toFixed(4),
      ).toBe("0.0000");
    });

    test("refuses to reverse the same set twice", async () => {
      await registerBaseCurrencies();

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100),
      });

      await ledger.reverse(original[0].entry_group_id);

      await expect(
        ledger.reverse(original[0].entry_group_id),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: `The ledger entry group "${original[0].entry_group_id}" has already been reversed.`,
        statusCode: 400,
      });
    });

    // Reversing a reversal would reinstate the original set while every
    // "has this been reversed" check kept answering yes.
    test("refuses to reverse a reversal", async () => {
      await registerBaseCurrencies();

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: balancedPair(100),
      });

      const reversal = await ledger.reverse(original[0].entry_group_id);

      await expect(
        ledger.reverse(reversal[0].entry_group_id),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: `The ledger entry group "${reversal[0].entry_group_id}" is itself a reversal and cannot be reversed.`,
        statusCode: 400,
      });
    });

    // The check in reverse() is read-then-write; the unique index on
    // reverses_entry_id is what actually stops a concurrent second clawback.
    test("survives two concurrent reversals of the same set", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const sale = await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
      });

      const outcomes = await Promise.allSettled([
        ledger.reverse(sale[0].entry_group_id),
        ledger.reverse(sale[0].entry_group_id),
      ]);

      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);

      // Exactly one clawback landed, so the affiliate is owed nothing rather
      // than owing us the commission back.
      expect(
        (await ledger.balanceFor("STORE", affiliate.id, "USD")).toFixed(4),
      ).toBe("0.0000");
    });

    // VarChar(255): an original sitting near the limit must not push the
    // derived text over it.
    test("truncates a derived description that would overflow", async () => {
      await registerBaseCurrencies();

      const longDescription = "x".repeat(255);

      const original = await ledger.record({
        source_type: "SALE",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "CONSUMER_PAYMENT",
            amount: 100,
            currency: "USD",
            description: longDescription,
          },
          { account_type: "PLATFORM_REVENUE", amount: -100, currency: "USD" },
        ],
      });

      const reversal = await ledger.reverse(original[0].entry_group_id);

      expect(reversal[0].description?.length).toBeLessThanOrEqual(255);
    });

    test("throws NotFoundError for an unknown group", async () => {
      await registerBaseCurrencies();

      const unknownGroupId = randomUUID();

      await expect(ledger.reverse(unknownGroupId)).rejects.toMatchObject({
        name: "NotFoundError",
        message: `No ledger entries were found for the group "${unknownGroupId}".`,
        action: "Check the entry group id and try again.",
        statusCode: 404,
      });
    });
  });

  describe(".balancesFor()", () => {
    test("returns nothing for an owner with no entries", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();

      expect(await ledger.balancesFor("STORE", affiliate.id)).toEqual([]);
    });

    // Signed as stored: negative while the platform owes it.
    test("sums the commission entries an owner holds", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });

      const balances = await ledger.balancesFor("STORE", affiliate.id);

      expect(balances).toHaveLength(1);
      expect(balances[0].currency).toBe("USD");
      expect(balances[0].amount.toFixed(4)).toBe("-20.0000");
    });

    // The property the whole model is built around: two currencies, two
    // balances, never one number.
    test("keeps each currency as its own balance", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        commission: 10,
      });
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        currency: "BRL",
        gross: 550,
        supplier_cost: 385,
        commission: 55,
      });

      const balances = await ledger.balancesFor("STORE", affiliate.id);

      expect(balances).toEqual([
        { currency: "BRL", amount: expect.anything() },
        { currency: "USD", amount: expect.anything() },
      ]);
      expect(balances[0].amount.toFixed(4)).toBe("-55.0000");
      expect(balances[1].amount.toFixed(4)).toBe("-10.0000");
    });

    test("does not mix one owner's balance into another's", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const otherAffiliate = await createOutlet();

      await orchestrator.recordLedgerSale({ store_id: affiliate.id });

      expect(await ledger.balancesFor("STORE", otherAffiliate.id)).toEqual([]);
    });

    // Prisma drops an undefined field from `where`, so without this guard a
    // missing owner id would return the platform-wide aggregate looking like
    // one affiliate's balance.
    test("refuses to compute a balance without an owner", async () => {
      await registerBaseCurrencies();

      await expect(
        ledger.balancesFor("STORE", undefined),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: "An owner type and id are required to read a ledger balance.",
        action: "Pass the type and id of the owner whose balance you want.",
        statusCode: 400,
      });
    });

    test("only counts the requested account type", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });

      const payouts = await ledger.balancesFor("STORE", affiliate.id, {
        account_type: "PAYOUT",
      });

      expect(payouts).toEqual([]);
    });
  });

  describe(".balanceFor()", () => {
    test("returns zero when the owner has nothing in that currency", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });

      expect(
        (await ledger.balanceFor("STORE", affiliate.id, "BRL")).toFixed(4),
      ).toBe("0.0000");
    });

    test("is case-insensitive on the currency code", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });

      expect(
        (await ledger.balanceFor("STORE", affiliate.id, "usd")).toFixed(4),
      ).toBe("-10.0000");
    });

    // The clawback case from task 9: a reversal after the commission was paid
    // out leaves a balance carried against future earnings.
    test("carries a negative balance after a clawback", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const sale = await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
      });

      // Settle the commission, as a payout run would.
      await ledger.record({
        source_type: "PAYOUT",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: 10,
            currency: "USD",
          },
          {
            account_type: "PAYOUT",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: -10,
            currency: "USD",
          },
        ],
      });

      expect(
        (await ledger.balanceFor("STORE", affiliate.id, "USD")).toFixed(4),
      ).toBe("0.0000");

      // The sale is charged back after the money already left.
      await ledger.reverse(sale[0].entry_group_id);

      expect(
        (
          await ledger.payableBalancesFor("STORE", affiliate.id)
        )[0].amount.toFixed(4),
      ).toBe("-10.0000");
    });
  });

  describe(".maturedBalancesFor()", () => {
    test("excludes a commission still inside its hold", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: new Date(Date.now() + 30 * DAY_IN_MS),
      });

      expect(await ledger.maturedBalancesFor("STORE", affiliate.id)).toEqual(
        [],
      );
    });

    test("includes a commission whose hold has passed", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: new Date(Date.now() - DAY_IN_MS),
      });

      const matured = await ledger.maturedBalancesFor("STORE", affiliate.id);

      expect(matured).toHaveLength(1);
      expect(matured[0].amount.toFixed(4)).toBe("-10.0000");
    });

    test("treats a null hold as always matured", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: null,
      });

      const matured = await ledger.maturedBalancesFor("STORE", affiliate.id);

      expect(matured[0].amount.toFixed(4)).toBe("-10.0000");
    });

    test("counts a commission as of the given moment", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: new Date("2026-09-30T00:00:00.000Z"),
      });

      expect(
        await ledger.maturedBalancesFor("STORE", affiliate.id, {
          matured_as_of: new Date("2026-09-29T00:00:00.000Z"),
        }),
      ).toEqual([]);

      const matured = await ledger.maturedBalancesFor("STORE", affiliate.id, {
        matured_as_of: new Date("2026-10-01T00:00:00.000Z"),
      });

      expect(matured[0].amount.toFixed(4)).toBe("-10.0000");
    });

    // A reversal copies the original's hold, so a clawed-back commission
    // never becomes payable — the two cancel at the same instant.
    test("a reversed commission never matures", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const maturesAt = new Date("2026-09-30T00:00:00.000Z");

      const sale = await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: maturesAt,
      });

      await ledger.reverse(sale[0].entry_group_id);

      const matured = await ledger.maturedBalancesFor("STORE", affiliate.id, {
        matured_as_of: new Date("2026-10-01T00:00:00.000Z"),
      });

      expect(matured[0].amount.toFixed(4)).toBe("0.0000");
    });
  });

  describe(".payableBalancesFor()", () => {
    // The one place the sign flips. The ledger stores what the platform holds,
    // so a commission it owes is negative there and positive here.
    test("reports an owed commission as positive", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });

      const payable = await ledger.payableBalancesFor("STORE", affiliate.id);

      expect(payable[0].currency).toBe("USD");
      expect(payable[0].amount.toFixed(4)).toBe("10.0000");
    });

    test("keeps each currency separate", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({ store_id: affiliate.id });
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        currency: "BRL",
        gross: 550,
        supplier_cost: 385,
        commission: 55,
      });

      const payable = await ledger.payableBalancesFor("STORE", affiliate.id);

      expect(payable.map((balance) => balance.currency)).toEqual([
        "BRL",
        "USD",
      ]);
      expect(payable[0].amount.toFixed(4)).toBe("55.0000");
      expect(payable[1].amount.toFixed(4)).toBe("10.0000");
    });
  });

  describe(".maturedPayableBalancesFor()", () => {
    // The number a payout run pays against. maturedBalancesFor returns the raw
    // ledger sign — negative while owed — so the obviously-named function for
    // the highest-stakes caller has to be the one that is also correct.
    test("reports a matured commission as positive", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: new Date(Date.now() - DAY_IN_MS),
      });

      const payable = await ledger.maturedPayableBalancesFor(
        "STORE",
        affiliate.id,
      );

      expect(payable[0].currency).toBe("USD");
      expect(payable[0].amount.toFixed(4)).toBe("10.0000");
    });

    test("excludes a commission still inside its hold", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: new Date(Date.now() + DAY_IN_MS),
      });

      expect(
        await ledger.maturedPayableBalancesFor("STORE", affiliate.id),
      ).toEqual([]);
    });
  });

  describe(".maturityFor()", () => {
    test("is the hold length after the given moment", async () => {
      const maturesAt = ledger.maturityFor(
        new Date("2026-08-05T12:00:00.000Z"),
      );

      expect(maturesAt.toISOString()).toBe("2026-09-04T12:00:00.000Z");
    });

    test("holds for the documented number of days", async () => {
      expect(ledger.COMMISSION_HOLD_DAYS).toBe(30);
    });
  });

  // The hold is the platform's entire chargeback defence, so the instant it
  // ends is the assertion that matters, not a day either side of it.
  describe("the maturation boundary", () => {
    test("is inclusive of the maturity instant", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const maturesAt = new Date("2026-09-30T00:00:00.000Z");

      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: maturesAt,
      });

      const atTheInstant = await ledger.maturedPayableBalancesFor(
        "STORE",
        affiliate.id,
        { matured_as_of: maturesAt },
      );

      expect(atTheInstant[0].amount.toFixed(4)).toBe("10.0000");
    });

    test("excludes the millisecond before", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const maturesAt = new Date("2026-09-30T00:00:00.000Z");

      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        matures_at: maturesAt,
      });

      const justBefore = await ledger.maturedPayableBalancesFor(
        "STORE",
        affiliate.id,
        {
          matured_as_of: new Date(maturesAt.getTime() - 1),
        },
      );

      expect(justBefore).toEqual([]);
    });
  });

  // The invariant is enforced per set at write time. This asserts the property
  // it is supposed to produce: after an arbitrary mix of activity, the books as
  // a whole are still zero in every currency.
  describe("the ledger as a whole", () => {
    test("nets to zero per currency after sales, reversals and a payout", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();
      const otherAffiliate = await createOutlet();

      await orchestrator.recordLedgerSale({ store_id: affiliate.id });
      await orchestrator.recordLedgerSale({
        store_id: otherAffiliate.id,
        currency: "BRL",
        gross: 550,
        supplier_cost: 385,
        commission: 55,
      });
      await orchestrator.recordLedgerSale();

      const reversed = await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
      });
      await ledger.reverse(reversed[0].entry_group_id);

      await ledger.record({
        source_type: "PAYOUT",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: 10,
            currency: "USD",
          },
          {
            account_type: "PAYOUT",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: -10,
            currency: "USD",
          },
        ],
      });

      const totals = await prisma.ledgerEntry.groupBy({
        by: ["currency"],
        _sum: { amount: true },
      });

      expect(totals).toHaveLength(2);
      for (const total of totals) {
        expect(total._sum.amount?.toFixed(4)).toBe("0.0000");
      }
    });
  });

  // The shape the architecture doc describes for a payout that has to cross
  // currencies: two independently balanced pairs, each carrying the rate.
  describe("a cross-currency conversion set", () => {
    test("balances in both currencies and records the rate on both legs", async () => {
      await registerBaseCurrencies();

      const affiliate = await createOutlet();

      // Earn a BRL commission first — there has to be a balance to convert.
      await orchestrator.recordLedgerSale({
        store_id: affiliate.id,
        currency: "BRL",
        gross: 550,
        supplier_cost: 385,
        commission: 55,
        matures_at: null,
      });

      const entries = await ledger.record({
        source_type: "PAYOUT",
        source_id: randomUUID(),
        entries: [
          // The BRL commission balance is settled...
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: 55,
            currency: "BRL",
          },
          {
            account_type: "PAYOUT",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: -55,
            currency: "BRL",
          },
          // ...and re-expressed in the currency it will actually be paid in.
          {
            account_type: "PAYOUT",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: 10,
            currency: "USD",
            exchange_rate: 5.5,
            exchange_rate_from_currency: "BRL",
          },
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: affiliate.id,
            amount: -10,
            currency: "USD",
            exchange_rate: 5.5,
            exchange_rate_from_currency: "BRL",
          },
        ],
      });

      expect(entries).toHaveLength(4);

      const usdLegs = entries.filter((entry) => entry.currency === "USD");
      expect(usdLegs).toHaveLength(2);
      for (const leg of usdLegs) {
        expect(leg.exchange_rate?.toFixed(8)).toBe("5.50000000");
        expect(leg.exchange_rate_from_currency).toBe("BRL");
      }

      // The BRL balance is cleared and the USD balance now carries the debt.
      expect(
        (await ledger.balanceFor("STORE", affiliate.id, "BRL")).toFixed(4),
      ).toBe("0.0000");
      const payable = await ledger.payableBalancesFor("STORE", affiliate.id);
      expect(
        payable
          .find((balance) => balance.currency === "USD")
          ?.amount.toFixed(4),
      ).toBe("10.0000");
    });
  });

  describe(".findBySource()", () => {
    test("returns every entry written against one source", async () => {
      await registerBaseCurrencies();

      const saleId = randomUUID();
      const affiliate = await createOutlet();
      await orchestrator.recordLedgerSale({
        source_id: saleId,
        store_id: affiliate.id,
      });

      const entries = await ledger.findBySource("SALE", saleId);

      expect(entries).toHaveLength(4);
      expect(entries.map((entry) => entry.account_type).sort()).toEqual([
        "AFFILIATE_COMMISSION",
        "CONSUMER_PAYMENT",
        "PLATFORM_REVENUE",
        "SUPPLIER_COST",
      ]);
    });

    test("returns nothing for an unknown source", async () => {
      await registerBaseCurrencies();

      expect(await ledger.findBySource("SALE", randomUUID())).toEqual([]);
    });
  });

  describe(".isSourceReversed()", () => {
    test("is false for a source that has not been reversed", async () => {
      await registerBaseCurrencies();

      const saleId = randomUUID();
      await orchestrator.recordLedgerSale({ source_id: saleId });

      expect(await ledger.isSourceReversed("SALE", saleId)).toBe(false);
    });

    test("is true once a reversal has been written", async () => {
      await registerBaseCurrencies();

      const saleId = randomUUID();
      const sale = await orchestrator.recordLedgerSale({ source_id: saleId });

      await ledger.reverse(sale[0].entry_group_id);

      expect(await ledger.isSourceReversed("SALE", saleId)).toBe(true);
    });
  });
});
