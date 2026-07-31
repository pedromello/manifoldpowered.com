import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/backoffice/currencies", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/currencies`,
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: read:currency:any",
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
        `${webserver.getOrigin()}/api/v1/backoffice/currencies`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("Should list currencies including disabled ones, ordered by code", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createCurrency({
        code: "JPY",
        symbol: "¥",
        decimal_places: 0,
        enabled: false,
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/currencies`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.currencies.map((row) => row.code)).toEqual([
        "BRL",
        "JPY",
        "USD",
      ]);
      expect(responseBody.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        pages: 1,
      });

      const japaneseYen = responseBody.currencies.find(
        (row) => row.code === "JPY",
      );
      expect(japaneseYen).toEqual({
        id: japaneseYen.id,
        code: "JPY",
        symbol: "¥",
        decimal_places: 0,
        enabled: false,
        created_at: japaneseYen.created_at,
        updated_at: japaneseYen.updated_at,
      });
    });

    test("Should filter by enabled", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({
        code: "JPY",
        symbol: "¥",
        enabled: false,
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/currencies?enabled=false`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.currencies.map((row) => row.code)).toEqual(["JPY"]);
    });

    test("With an invalid limit should return 400", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/backoffice/currencies?limit=999`,
        { headers: { Cookie: `session_id=${session.token}` } },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid query parameters");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
