import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import currency from "models/currency";
import auditLog from "models/audit_log";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function postCurrency(sessionToken: string, body: unknown) {
  return await fetch(`${webserver.getOrigin()}/api/v1/backoffice/currencies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/backoffice/currencies", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/currencies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "USD", symbol: "$" }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: create:currency:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await postCurrency(session.token, {
        code: "USD",
        symbol: "$",
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("With valid data should return 201 Created", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postCurrency(session.token, {
        code: "BRL",
        symbol: "R$",
        decimal_places: 2,
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        code: "BRL",
        symbol: "R$",
        decimal_places: 2,
        enabled: true,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(await currency.findOneByCode("BRL")).toBeDefined();
    });

    test("Should normalise a lowercase code to uppercase", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postCurrency(session.token, {
        code: "brl",
        symbol: "R$",
      });

      expect(response.status).toBe(201);
      expect((await response.json()).code).toBe("BRL");
    });

    test("Should write an audit log entry", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postCurrency(session.token, {
        code: "BRL",
        symbol: "R$",
      });
      const responseBody = await response.json();

      const { logs } = await auditLog.findAllPaginated({});
      const entry = logs.find((log) => log.action === "currency:create");

      expect(entry).toBeDefined();
      expect(entry?.admin_user_id).toBe(admin.id);
      expect(entry?.target_type).toBe("currency");
      expect(entry?.target_id).toBe(responseBody.id);
    });

    test("With a duplicate code should return 400", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const response = await postCurrency(session.token, {
        code: "BRL",
        symbol: "R$",
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: 'The currency "BRL" is already registered.',
        name: "ValidationError",
        action: "Use a different currency code or update the existing one.",
        status_code: 400,
      });
    });

    test("With a malformed code should return 400", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postCurrency(session.token, {
        code: "REAL",
        symbol: "R$",
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
