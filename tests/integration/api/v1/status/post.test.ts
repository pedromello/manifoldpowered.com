import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

describe("POST /api/v1/status", () => {
  describe("Anonymous user", () => {
    test("Should return 405 Method Not Allowed", async () => {
      const response = await fetch("http://localhost:3000/api/v1/status", {
        method: "POST",
      });
      expect(response.status).toBe(405);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "MethodNotAllowedError",
        message: "Method not allowed for this endpoint",
        action: "Check if HTTP method is allowed for this endpoint",
        status_code: 405,
      });
    });
  });
});
