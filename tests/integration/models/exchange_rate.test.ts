import orchestrator from "tests/orchestrator";
import exchangeRate from "models/exchange_rate";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function registerBaseCurrencies() {
  await orchestrator.clearDatabaseRows();
  await orchestrator.createCurrency({ code: "USD", symbol: "$" });
  await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
}

describe("models/exchange_rate.ts", () => {
  describe(".record()", () => {
    test("records a rate with the given fields", async () => {
      await registerBaseCurrencies();

      const recorded = await exchangeRate.record({
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5.4321,
        source: "MANUAL",
        effective_at: new Date("2026-07-01T00:00:00.000Z"),
      });

      expect(recorded.base_currency).toBe("USD");
      expect(recorded.quote_currency).toBe("BRL");
      expect(recorded.rate.toFixed(4)).toBe("5.4321");
      expect(recorded.source).toBe("MANUAL");
      expect(recorded.effective_at.toISOString()).toBe(
        "2026-07-01T00:00:00.000Z",
      );
      expect(recorded.created_at).toBeInstanceOf(Date);
    });

    test("keeps the full 8-decimal scale", async () => {
      await registerBaseCurrencies();

      const recorded = await exchangeRate.record({
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5.43210987,
        source: "AUTOMATIC",
        effective_at: new Date(),
      });

      expect(recorded.rate.toFixed(8)).toBe("5.43210987");
    });

    test("rejects an unregistered currency with a ValidationError", async () => {
      await registerBaseCurrencies();

      await expect(
        exchangeRate.record({
          base_currency: "USD",
          quote_currency: "JPY",
          rate: 150,
          source: "MANUAL",
          effective_at: new Date(),
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: "The following currencies are not registered: JPY.",
        action:
          "Register the currency before recording an exchange rate for it.",
        statusCode: 400,
      });
    });
  });

  describe(".recordMany()", () => {
    test("records every rate in the batch", async () => {
      await registerBaseCurrencies();
      await orchestrator.createCurrency({ code: "EUR", symbol: "€" });

      const recorded = await exchangeRate.recordMany([
        {
          base_currency: "USD",
          quote_currency: "BRL",
          rate: 5.5,
          source: "BULK",
          effective_at: new Date(),
        },
        {
          base_currency: "USD",
          quote_currency: "EUR",
          rate: 0.92,
          source: "BULK",
          effective_at: new Date(),
        },
      ]);

      expect(recorded).toHaveLength(2);
      expect(recorded.map((row) => row.quote_currency).sort()).toEqual([
        "BRL",
        "EUR",
      ]);
    });

    test("writes nothing when any currency in the batch is unregistered", async () => {
      await registerBaseCurrencies();

      await expect(
        exchangeRate.recordMany([
          {
            base_currency: "USD",
            quote_currency: "BRL",
            rate: 5.5,
            source: "BULK",
            effective_at: new Date(),
          },
          {
            base_currency: "USD",
            quote_currency: "JPY",
            rate: 150,
            source: "BULK",
            effective_at: new Date(),
          },
        ]),
      ).rejects.toMatchObject({ name: "ValidationError" });

      // The valid row must not have landed either.
      expect(await exchangeRate.findLatest("USD", "BRL")).toBeNull();
    });

    test("rejects an empty batch", async () => {
      await registerBaseCurrencies();

      await expect(exchangeRate.recordMany([])).rejects.toMatchObject({
        name: "ValidationError",
        message: "No exchange rates were provided.",
        action: "Send at least one exchange rate to record.",
        statusCode: 400,
      });
    });
  });

  describe(".findLatest()", () => {
    test("returns the newest rate already in effect", async () => {
      await registerBaseCurrencies();
      await orchestrator.createExchangeRate({
        rate: 5.0,
        effective_at: new Date("2026-07-01T00:00:00.000Z"),
      });
      await orchestrator.createExchangeRate({
        rate: 5.5,
        effective_at: new Date("2026-07-15T00:00:00.000Z"),
      });

      const latest = await exchangeRate.findLatest(
        "USD",
        "BRL",
        new Date("2026-07-20T00:00:00.000Z"),
      );

      expect(latest?.rate.toFixed(2)).toBe("5.50");
    });

    test("ignores rates that are not in effect yet", async () => {
      await registerBaseCurrencies();
      await orchestrator.createExchangeRate({
        rate: 5.0,
        effective_at: new Date("2026-07-01T00:00:00.000Z"),
      });
      await orchestrator.createExchangeRate({
        rate: 9.9,
        effective_at: new Date("2026-12-01T00:00:00.000Z"),
      });

      const latest = await exchangeRate.findLatest(
        "USD",
        "BRL",
        new Date("2026-07-20T00:00:00.000Z"),
      );

      expect(latest?.rate.toFixed(2)).toBe("5.00");
    });

    test("is case-insensitive on the currency pair", async () => {
      await registerBaseCurrencies();
      await orchestrator.createExchangeRate({ rate: 5.25 });

      const latest = await exchangeRate.findLatest("usd", "brl");

      expect(latest?.rate.toFixed(2)).toBe("5.25");
    });

    test("returns null when the pair has no rate", async () => {
      await registerBaseCurrencies();

      expect(await exchangeRate.findLatest("BRL", "USD")).toBeNull();
    });
  });

  describe(".findLatestOrFail()", () => {
    test("throws NotFoundError when the pair has no rate", async () => {
      await registerBaseCurrencies();

      await expect(
        exchangeRate.findLatestOrFail("BRL", "USD"),
      ).rejects.toMatchObject({
        name: "NotFoundError",
        message: "No exchange rate is available from BRL to USD.",
        action: "Record an exchange rate for this currency pair and try again.",
        statusCode: 404,
      });
    });
  });

  describe(".listByPair()", () => {
    test("returns rates newest-first with pagination metadata", async () => {
      await registerBaseCurrencies();
      await orchestrator.createExchangeRate({
        rate: 5.0,
        effective_at: new Date("2026-07-01T00:00:00.000Z"),
      });
      await orchestrator.createExchangeRate({
        rate: 5.5,
        effective_at: new Date("2026-07-15T00:00:00.000Z"),
      });

      const result = await exchangeRate.listByPair("USD", "BRL", { limit: 1 });

      expect(result.rates).toHaveLength(1);
      expect(result.rates[0].rate.toFixed(2)).toBe("5.50");
      expect(result.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        pages: 2,
      });
    });
  });
});
