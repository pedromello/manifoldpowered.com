import type { CallToolResult } from "@modelcontextprotocol/server";
import { publicCatalogMcp } from "infra/public_catalog_mcp";
import publicGameCatalog from "models/public_game_catalog";

afterEach(() => jest.restoreAllMocks());
afterAll(async () => publicCatalogMcp.close());

describe("Public catalog MCP error boundary", () => {
  test("A model failure returns a generic tool error without SQL, stack or credentials", async () => {
    jest
      .spyOn(publicGameCatalog, "search")
      .mockRejectedValue(
        new Error(
          "SQL failure postgresql://synthetic:secret@private.example.invalid",
        ),
      );
    jest.spyOn(console, "error").mockImplementation(() => {});
    const response = await publicCatalogMcp.fetch(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_games", arguments: {} },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const payload = response.headers
      .get("content-type")
      ?.includes("text/event-stream")
      ? text.match(/^data: (.+)$/m)?.[1]
      : text;
    const body = JSON.parse(payload) as { result: CallToolResult };
    expect(body.result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Public catalog is temporarily unavailable. Try again later.",
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(
      /SQL|postgresql|secret|example\.invalid|stack/,
    );
  });
});
