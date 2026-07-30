import orchestrator from "tests/orchestrator";
import currency from "models/currency";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("models/currency.ts", () => {
  describe(".create()", () => {
    test("creates a currency with the given fields", async () => {
      await orchestrator.clearDatabaseRows();

      const created = await currency.create({
        code: "USD",
        symbol: "$",
        decimal_places: 2,
        enabled: true,
      });

      expect(created.code).toBe("USD");
      expect(created.symbol).toBe("$");
      expect(created.decimal_places).toBe(2);
      expect(created.enabled).toBe(true);
      expect(created.created_at).toBeInstanceOf(Date);
    });

    test("rejects a duplicate code with a ValidationError", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      await expect(
        currency.create({
          code: "BRL",
          symbol: "R$",
          decimal_places: 2,
          enabled: true,
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: 'The currency "BRL" is already registered.',
        action: "Use a different currency code or update the existing one.",
        statusCode: 400,
      });
    });
  });

  describe(".findOneByCode()", () => {
    test("finds a currency regardless of the casing used", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const found = await currency.findOneByCode("brl");

      expect(found.code).toBe("BRL");
    });

    test("throws NotFoundError for an unregistered code", async () => {
      await orchestrator.clearDatabaseRows();

      await expect(currency.findOneByCode("JPY")).rejects.toMatchObject({
        name: "NotFoundError",
        message: 'The currency "JPY" was not found.',
        action: "Check the currency code and try again.",
        statusCode: 404,
      });
    });
  });

  describe(".findAllEnabled()", () => {
    test("returns only enabled currencies, ordered by code", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createCurrency({
        code: "JPY",
        symbol: "¥",
        enabled: false,
      });

      const enabledCurrencies = await currency.findAllEnabled();

      expect(enabledCurrencies.map((row) => row.code)).toEqual(["BRL", "USD"]);
    });
  });

  describe(".setEnabled()", () => {
    test("disables a currency without deleting it", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const disabled = await currency.setEnabled("BRL", false);

      expect(disabled.enabled).toBe(false);
      expect((await currency.findOneByCode("BRL")).enabled).toBe(false);
    });
  });

  describe(".findUnregisteredCodes()", () => {
    test("returns only the codes that are missing, deduplicated", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });

      const unregistered = await currency.findUnregisteredCodes([
        "USD",
        "brl",
        "BRL",
        "JPY",
      ]);

      expect(unregistered.sort()).toEqual(["BRL", "JPY"]);
    });

    test("returns an empty array when every code is registered", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });

      expect(await currency.findUnregisteredCodes(["USD"])).toEqual([]);
    });
  });
});
