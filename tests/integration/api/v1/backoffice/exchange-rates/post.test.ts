import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import exchangeRate from "models/exchange_rate";
import auditLog from "models/audit_log";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function postRate(sessionToken: string, body: unknown) {
  return await fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionToken}`,
      },
      body: JSON.stringify(body),
    },
  );
}

async function setupAdminWithCurrencies() {
  await orchestrator.clearDatabaseRows();
  const admin = await orchestrator.createAdminUser();
  const session = await orchestrator.createSession(admin.id);
  await orchestrator.createCurrency({ code: "USD", symbol: "$" });
  await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

  return { admin, session };
}

describe("POST /api/v1/backoffice/exchange-rates", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/exchange-rates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_currency: "USD",
            quote_currency: "BRL",
            rate: 5.5,
            source: "MANUAL",
          }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: create:exchange_rate:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5.5,
        source: "MANUAL",
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("With valid data should return 201 Created", async () => {
      const { session } = await setupAdminWithCurrencies();

      const response = await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5.4321,
        source: "MANUAL",
        effective_at: "2026-07-01T00:00:00.000Z",
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        base_currency: "USD",
        quote_currency: "BRL",
        rate: "5.43210000",
        source: "MANUAL",
        effective_at: "2026-07-01T00:00:00.000Z",
        created_at: responseBody.created_at,
      });
    });

    test("Recording a new rate appends rather than replacing", async () => {
      const { session } = await setupAdminWithCurrencies();

      await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5.0,
        source: "MANUAL",
        effective_at: "2026-07-01T00:00:00.000Z",
      });
      await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 6.0,
        source: "MANUAL",
        effective_at: "2026-07-15T00:00:00.000Z",
      });

      const { pagination } = await exchangeRate.listByPair("USD", "BRL");
      expect(pagination.total).toBe(2);

      const latest = await exchangeRate.findLatest(
        "USD",
        "BRL",
        new Date("2026-07-20T00:00:00.000Z"),
      );
      expect(latest?.rate.toFixed(2)).toBe("6.00");
    });

    test("Should write an audit log entry", async () => {
      const { admin, session } = await setupAdminWithCurrencies();

      const response = await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5.5,
        source: "MANUAL",
      });
      const responseBody = await response.json();

      const { logs } = await auditLog.findAllPaginated({
        action: "exchange_rate:create",
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].admin_user_id).toBe(admin.id);
      expect(logs[0].target_id).toBe(responseBody.id);
      expect(logs[0].metadata).toMatchObject({
        base_currency: "USD",
        quote_currency: "BRL",
        rate: "5.50000000",
      });
    });

    test("With an unregistered currency should return 400", async () => {
      const { session } = await setupAdminWithCurrencies();

      const response = await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "JPY",
        rate: 150,
        source: "MANUAL",
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "The following currencies are not registered: JPY.",
        name: "ValidationError",
        action:
          "Register the currency before recording an exchange rate for it.",
        status_code: 400,
      });
    });

    test("With the same currency on both sides should return 400", async () => {
      const { session } = await setupAdminWithCurrencies();

      const response = await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "USD",
        rate: 1,
        source: "MANUAL",
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });

    test("With a negative rate should return 400", async () => {
      const { session } = await setupAdminWithCurrencies();

      const response = await postRate(session.token, {
        base_currency: "USD",
        quote_currency: "BRL",
        rate: -1,
        source: "MANUAL",
      });

      expect(response.status).toBe(400);
      expect((await response.json()).name).toBe("ValidationError");
    });
  });
});
