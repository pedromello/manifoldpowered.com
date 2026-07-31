import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/backoffice/exchange-rates", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates`,
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: read:exchange_rate:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("Should list rates newest-first with pagination", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      await orchestrator.createExchangeRate({
        rate: 5.0,
        effective_at: new Date("2026-07-01T00:00:00.000Z"),
      });
      await orchestrator.createExchangeRate({
        rate: 6.0,
        effective_at: new Date("2026-07-15T00:00:00.000Z"),
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.exchange_rates.map((row) => row.rate)).toEqual([
        "6.00000000",
        "5.00000000",
      ]);
      expect(responseBody.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
      });

      expect(responseBody.exchange_rates[0]).toEqual({
        id: responseBody.exchange_rates[0].id,
        base_currency: "USD",
        quote_currency: "BRL",
        rate: "6.00000000",
        source: "MANUAL",
        effective_at: "2026-07-15T00:00:00.000Z",
        created_at: responseBody.exchange_rates[0].created_at,
      });
    });

    test("Should filter by currency pair", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createCurrency({ code: "EUR", symbol: "€" });

      await orchestrator.createExchangeRate({ quote_currency: "BRL", rate: 5 });
      await orchestrator.createExchangeRate({
        quote_currency: "EUR",
        rate: 0.92,
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates?base_currency=USD&quote_currency=eur`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.exchange_rates).toHaveLength(1);
      expect(responseBody.exchange_rates[0].quote_currency).toBe("EUR");
    });

    test("With a malformed currency filter should return 400", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates?base_currency=DOLLAR`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid query parameters");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
