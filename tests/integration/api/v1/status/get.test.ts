import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

describe("GET /api/v1/status", () => {
  describe("Anonymous user", () => {
    test("Should successfully return data about the application", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/status`);
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      const parsedUpdatedAt = new Date(responseBody.updated_at).toISOString();
      expect(parsedUpdatedAt).toEqual(responseBody.updated_at);

      expect(responseBody.dependencies.database).not.toHaveProperty("version");

      // Test database max connections
      expect(responseBody.dependencies.database.max_connections).toEqual(100);

      // Test database open connections
      expect(
        responseBody.dependencies.database.open_connections,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Default user", () => {
    test("With valid session token", async () => {
      const defaultUser = await orchestrator.createUser();
      await orchestrator.activateUser(defaultUser.id);
      const defaultUserSession = await orchestrator.createSession(
        defaultUser.id,
      );

      const response = await fetch(`${webserver.getOrigin()}/api/v1/status`, {
        headers: {
          Cookie: `session_id=${defaultUserSession.token}`,
        },
      });
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      const parsedUpdatedAt = new Date(responseBody.updated_at).toISOString();
      expect(parsedUpdatedAt).toEqual(responseBody.updated_at);

      expect(responseBody.dependencies.database).not.toHaveProperty("version");

      // Test database max connections
      expect(responseBody.dependencies.database.max_connections).toEqual(100);

      // Test database open connections
      expect(
        responseBody.dependencies.database.open_connections,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Privileged user", () => {
    test("With valid session token", async () => {
      const privilegedUser = await orchestrator.createUser();
      await orchestrator.activateUser(privilegedUser.id);
      await orchestrator.addFeaturesToUser(privilegedUser.id, [
        "read:status:all",
      ]);
      const privilegedUserSession = await orchestrator.createSession(
        privilegedUser.id,
      );

      const response = await fetch(`${webserver.getOrigin()}/api/v1/status`, {
        headers: {
          Cookie: `session_id=${privilegedUserSession.token}`,
        },
      });
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      const parsedUpdatedAt = new Date(responseBody.updated_at).toISOString();
      expect(parsedUpdatedAt).toEqual(responseBody.updated_at);

      // Test database version
      expect(responseBody.dependencies.database.version).toEqual("16.0");

      // Test database max connections
      expect(responseBody.dependencies.database.max_connections).toEqual(100);

      // Test database open connections
      expect(
        responseBody.dependencies.database.open_connections,
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
