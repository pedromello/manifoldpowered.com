import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/mcp", () => {
  test("Does not expose a legacy standalone event stream or catalog via GET", async () => {
    const response = await fetch(`${webserver.getOrigin()}/api/mcp`, {
      headers: {
        Accept: "text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
