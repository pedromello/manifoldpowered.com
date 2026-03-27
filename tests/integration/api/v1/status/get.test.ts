import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

describe("GET /api/v1/status", () => {
  describe("Anonymous user", () => {
    test("Should successfully return data about the application", async () => {
      const response = await fetch("http://localhost:3000/api/v1/status");
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
