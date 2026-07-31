import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import currency from "models/currency";
import auditLog from "models/audit_log";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function patchCurrency(
  sessionToken: string,
  code: string,
  body: unknown,
) {
  return await fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/currencies/${code}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionToken}`,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH /api/v1/backoffice/currencies/[code]", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/currencies/BRL`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: update:currency:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await patchCurrency(session.token, "BRL", {
        enabled: false,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("Should disable a currency", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const response = await patchCurrency(session.token, "BRL", {
        enabled: false,
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.enabled).toBe(false);
      expect((await currency.findOneByCode("BRL")).enabled).toBe(false);
    });

    test("Should update symbol and decimal_places", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "JPY", symbol: "Y" });

      const response = await patchCurrency(session.token, "JPY", {
        symbol: "¥",
        decimal_places: 0,
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.symbol).toBe("¥");
      expect(responseBody.decimal_places).toBe(0);
      // Untouched fields stay as they were.
      expect(responseBody.enabled).toBe(true);
    });

    test("Should accept a lowercase code in the path", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const response = await patchCurrency(session.token, "brl", {
        enabled: false,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).code).toBe("BRL");
    });

    test("Should write an audit log entry with the previous state", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      await patchCurrency(session.token, "BRL", { enabled: false });

      const { logs } = await auditLog.findAllPaginated({
        action: "currency:update",
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].admin_user_id).toBe(admin.id);
      expect(logs[0].target_type).toBe("currency");
      expect(logs[0].metadata).toMatchObject({
        code: "BRL",
        previous: { enabled: true },
        applied: { enabled: false },
      });
    });

    test("With an unknown code should return 404", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchCurrency(session.token, "JPY", {
        enabled: false,
      });

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: 'The currency "JPY" was not found.',
        name: "NotFoundError",
        action: "Check the currency code and try again.",
        status_code: 404,
      });
    });

    test("With an empty body should return 400", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const response = await patchCurrency(session.token, "BRL", {});

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.status_code).toBe(400);
    });

    test("Should not allow changing the code", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      // The code is the logical reference every rate and override points at,
      // and with no foreign keys a rename would orphan them silently.
      const response = await patchCurrency(session.token, "BRL", {
        code: "XXX",
        symbol: "R$$",
      });

      expect(response.status).toBe(200);
      expect((await response.json()).code).toBe("BRL");
      expect(await currency.findOneByCode("BRL")).toBeDefined();
    });
  });
});
