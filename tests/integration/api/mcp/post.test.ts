import type { CallToolResult } from "@modelcontextprotocol/server";
import { request as httpRequest } from "node:http";
import type { Game } from "generated/prisma/client";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameModel from "models/game";
import {
  catalogSearchResultSchema,
  catalogDetailResultSchema,
  catalogReviewsResultSchema,
} from "models/public_game_catalog";
import orchestrator from "tests/orchestrator";

let active: Game;
let displayOnly: Game;
let privateGame: Game;
let inactive: Game;
let adminCookie: string;

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  active = await orchestrator.createGame(owner.id, {
    title: "Catalog Alpha",
    description: "Catalog exploration",
    detailed_description: "PRIVATE_SENTINEL https://checkout.example.invalid",
    tags: ["action", "catalog-fixture"],
    launch_date: "2024-01-01T00:00:00.000Z",
    social_links: { steam_page: "https://checkout.example.invalid" },
    media: { screenshots: ["https://private.example.invalid"], videos: [] },
  });
  displayOnly = await orchestrator.createGame(owner.id, {
    title: "Catalog Beta",
    tags: ["rpg", "catalog-fixture"],
  });
  privateGame = await orchestrator.createGame(owner.id, {
    title: "Catalog Hidden",
    tags: ["action", "catalog-fixture"],
  });
  inactive = await orchestrator.createGame(owner.id, {
    title: "Catalog Inactive",
    tags: ["action", "catalog-fixture"],
  });
  await gameModel.setStatus(active.id, "ACTIVE");
  await gameModel.setStatus(displayOnly.id, "ONLY_DISPLAY");
  await gameModel.setStatus(inactive.id, "INACTIVE");
  await prisma.gameLocalization.update({
    where: { game_id_locale: { game_id: active.id, locale: "pt-BR" } },
    data: { title: "Catálogo Alfa", description: "Exploração localizada" },
  });
  for (let index = 0; index < 4; index++) {
    const author = await orchestrator.createUser({
      username: `private-review-author-${index}`,
    });
    await prisma.review.create({
      data: {
        id: `00000000-0000-0000-0000-00000000000${index + 1}`,
        game_id: displayOnly.id,
        user_id: author.id,
        message: [
          "Combat is fun.",
          "The map was confusing.",
          "Fluid combat.",
          "Beautiful atmosphere.",
        ][index],
        recommended: index !== 1,
        created_at: new Date("2026-01-01T00:00:00Z"),
      },
    });
  }
  await prisma.game.update({
    where: { id: displayOnly.id },
    data: {
      positive_reviews: 3,
      negative_reviews: 1,
      media: {
        banner: "javascript:alert(1)",
        screenshots: [
          "https://shared.fastly.steamstatic.com/catalog-fixture.jpg",
          "https://merchant.example.invalid/image.jpg",
        ],
        videos: [
          "https://video.fastly.steamstatic.com/catalog-fixture.mp4",
          "https://www.youtube.com/redirect?q=merchant",
        ],
      },
    },
  });
  const admin = await orchestrator.createAdminUser();
  const session = await orchestrator.createSession(admin.id);
  adminCookie = `session_id=${session.token}`;
});

async function rpc<T>(method: string, params = {}, headers = {}) {
  const response = await fetch(`${webserver.getOrigin()}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const payload = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? text.match(/^data: (.+)$/m)?.[1]
    : text;
  return { response, body: JSON.parse(payload) as { result: T } };
}

async function callTool(name: string, args = {}, headers = {}) {
  const { response, body } = await rpc<CallToolResult>(
    "tools/call",
    { name, arguments: args },
    headers,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("www-authenticate")).toBeNull();
  return body.result;
}

describe("POST /api/mcp", () => {
  describe("Anonymous user", () => {
    test("Projects actual stored media against the same bounded CSP policy in both channels", async () => {
      const result = await callTool("get_game", { slug: displayOnly.slug });
      expect(
        catalogDetailResultSchema.parse(result.structuredContent).game.media,
      ).toEqual({
        images: ["https://shared.fastly.steamstatic.com/catalog-fixture.jpg"],
        videos: [
          {
            url: "https://video.fastly.steamstatic.com/catalog-fixture.mp4",
            kind: "file",
          },
        ],
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
      expect(JSON.stringify(result)).not.toMatch(
        /javascript|merchant|redirect/,
      );
    });
    test("Advertises exactly three noauth read-only tools and strict schemas", async () => {
      const { response, body } = await rpc<{
        tools: Array<{
          name: string;
          securitySchemes: Array<{ type: string }>;
          annotations: Record<string, boolean>;
          inputSchema: { additionalProperties: boolean; properties: object };
          outputSchema: { additionalProperties: boolean };
        }>;
      }>("tools/list");
      expect(response.status).toBe(200);
      expect(body.result.tools.map((tool) => tool.name)).toEqual([
        "search_games",
        "get_game",
        "get_game_reviews",
      ]);
      for (const tool of body.result.tools) {
        expect(tool.securitySchemes).toEqual([{ type: "noauth" }]);
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.outputSchema.additionalProperties).toBe(false);
      }
    });

    test("Reviews filters, stable pagination, counters and sample stay separate", async () => {
      const first = catalogReviewsResultSchema.parse(
        (
          await callTool("get_game_reviews", {
            slug: displayOnly.slug,
            limit: 2,
          })
        ).structuredContent,
      );
      const second = catalogReviewsResultSchema.parse(
        (
          await callTool("get_game_reviews", {
            slug: displayOnly.slug,
            limit: 2,
            page: 2,
          })
        ).structuredContent,
      );
      expect(first.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 4,
        pages: 2,
      });
      expect(first.sample).toEqual({
        returned: 2,
        recommendation: "all",
        sort: "newest",
      });
      expect(first.game.review_summary).toEqual({
        total: 4,
        positive: 3,
        negative: 1,
        source: "catalog_counters",
      });
      expect(
        [...first.reviews, ...second.reviews].map((r) => r.reference),
      ).toEqual(
        [4, 3, 2, 1].map((i) => `00000000-0000-0000-0000-00000000000${i}`),
      );
      const positive = catalogReviewsResultSchema.parse(
        (
          await callTool("get_game_reviews", {
            slug: displayOnly.slug,
            recommendation: "positive",
            sort: "oldest",
          })
        ).structuredContent,
      );
      expect(positive.pagination.total).toBe(3);
      expect(positive.reviews.every((r) => r.recommended)).toBe(true);
      expect(positive.reviews[0].reference.endsWith("1")).toBe(true);
      const negative = await callTool("get_game_reviews", {
        slug: displayOnly.slug,
        recommendation: "negative",
      });
      expect(
        catalogReviewsResultSchema.parse(negative.structuredContent).pagination
          .total,
      ).toBe(1);
      expect(negative.content).toEqual([
        { type: "text", text: JSON.stringify(negative.structuredContent) },
      ]);
      expect(JSON.stringify(negative)).not.toMatch(
        /username|user_id|game_id|email|private-review-author|can_review|user_review|price/,
      );
    });

    test("Reviews empty/out-of-range pages and public visibility have honest results", async () => {
      const empty = catalogReviewsResultSchema.parse(
        (await callTool("get_game_reviews", { slug: active.slug }))
          .structuredContent,
      );
      expect(empty.reviews).toEqual([]);
      expect(empty.sample.returned).toBe(0);
      expect(empty.pagination.pages).toBe(0);
      const beyond = catalogReviewsResultSchema.parse(
        (
          await callTool("get_game_reviews", {
            slug: displayOnly.slug,
            page: 100,
          })
        ).structuredContent,
      );
      expect(beyond.reviews).toEqual([]);
      expect(beyond.pagination.total).toBe(4);
      for (const slug of [privateGame.slug, inactive.slug, "missing-game"]) {
        const result = await callTool(
          "get_game_reviews",
          { slug },
          { Cookie: adminCookie, Authorization: "Bearer ignored" },
        );
        expect(result).toEqual({
          isError: true,
          content: [{ type: "text", text: "Game not found." }],
        });
      }
    });

    test.each([
      { page: 0 },
      { page: 1.5 },
      { limit: 21 },
      { recommendation: "mixed" },
      { sort: "popular" },
      { confirmed: true },
      { user_id: "other" },
    ])("Reviews rejects invalid/unimplemented arguments: %j", async (extra) => {
      const result = await callTool("get_game_reviews", {
        slug: displayOnly.slug,
        ...extra,
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });

    test("MCP resource returns branded bundled HTML, narrow CSP and inline hints", async () => {
      const { body } = await rpc<{
        contents: Array<{
          uri: string;
          mimeType: string;
          text: string;
          _meta: Record<string, unknown>;
        }>;
      }>("resources/read", { uri: "ui://manifold/game-card/v1.html" });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
      expect(resource.text).toContain("--color-sf-bg: #1d0f3b");
      expect(resource.text).toContain("data:image/png;base64,");
      expect(resource.text).not.toContain("__MANIFOLD_LOGO__");
      expect(resource._meta["openai/ui"]).toEqual({
        availableDisplayModes: ["inline"],
        preferredDisplayMode: "inline",
      });
      const ui = resource._meta.ui as {
        csp: {
          resourceDomains: string[];
          connectDomains: string[];
          frameDomains: string[];
        };
      };
      expect(ui.csp.frameDomains).toEqual([]);
      expect(ui.csp.connectDomains).toEqual([]);
      expect(
        ui.csp.resourceDomains.every(
          (origin) => origin.startsWith("https://") && !origin.includes("*"),
        ),
      ).toBe(true);
      expect(resource.text).not.toMatch(
        /PRIVATE_SENTINEL|private-review-author/,
      );
    });

    test("Search and pagination include ACTIVE and ONLY_DISPLAY, never private/inactive", async () => {
      const result = await callTool("search_games", { q: "catalog", limit: 1 });
      const data = catalogSearchResultSchema.parse(result.structuredContent);
      expect(data.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        pages: 2,
      });
      const page2 = catalogSearchResultSchema.parse(
        (await callTool("search_games", { q: "catalog", page: 2, limit: 1 }))
          .structuredContent,
      );
      expect(
        new Set([...data.games, ...page2.games].map((game) => game.slug)),
      ).toEqual(new Set([active.slug, displayOnly.slug]));
    });

    test("Uses OR tags and returns successful empty results", async () => {
      const filtered = catalogSearchResultSchema.parse(
        (
          await callTool("search_games", {
            tags: ["action", "missing"],
            locale: "en",
          })
        ).structuredContent,
      );
      expect(filtered.games.map((game) => game.slug)).toEqual([active.slug]);
      const empty = catalogSearchResultSchema.parse(
        (await callTool("search_games", { q: "no-catalog-match", page: 2 }))
          .structuredContent,
      );
      expect(empty).toEqual({
        games: [],
        pagination: { page: 2, limit: 5, total: 0, pages: 0 },
        locale: "pt-BR",
      });
    });

    test("Search and detail expose only factual allowlist in both result channels", async () => {
      const search = await callTool("search_games", {
        q: "alpha",
        locale: "en",
      });
      const detail = await callTool("get_game", {
        slug: active.slug,
        locale: "en",
      });
      const expected = {
        slug: active.slug,
        title: "Catalog Alpha",
        description: "Catalog exploration",
        media: { images: [], videos: [] },
        review_summary: {
          total: 0,
          positive: 0,
          negative: 0,
          source: "catalog_counters",
        },
        tags: ["action", "catalog-fixture"],
        launch_date: "2024-01-01T00:00:00.000Z",
      };
      expect(
        catalogSearchResultSchema.parse(search.structuredContent).games,
      ).toEqual([expected]);
      expect(catalogDetailResultSchema.parse(detail.structuredContent)).toEqual(
        { game: expected, locale: "en" },
      );
      for (const result of [search, detail]) {
        expect(result.content).toEqual([
          { type: "text", text: JSON.stringify(result.structuredContent) },
        ]);
        expect(JSON.stringify(result)).not.toMatch(
          /PRIVATE_SENTINEL|example\.invalid|price|offer|purchase|studio_id|password|session_id/,
        );
      }
    });

    test("Known PRIVATE/INACTIVE slugs return the same error as nonexistent", async () => {
      const expected = {
        isError: true,
        content: [{ type: "text", text: "Game not found." }],
      };
      for (const slug of [
        privateGame.slug,
        inactive.slug,
        "missing-catalog-game",
      ]) {
        expect(await callTool("get_game", { slug })).toEqual(expected);
      }
    });

    test("Searches localized text and returns the requested factual title", async () => {
      const result = catalogSearchResultSchema.parse(
        (await callTool("search_games", { q: "exploração", locale: "pt-BR" }))
          .structuredContent,
      );
      expect(result.games.map((game) => [game.slug, game.title])).toEqual([
        [active.slug, "Catálogo Alfa"],
      ]);
    });

    test("Does not emit HTML or explicit URLs from catalog title/tags", async () => {
      const owner = await orchestrator.createUser();
      const marked = await orchestrator.createGame(owner.id, {
        title: "<b>Text-only Result</b> https://checkout.example.invalid",
        tags: ["<i>genre</i>", "https://checkout.example.invalid"],
      });
      await gameModel.setStatus(marked.id, "ONLY_DISPLAY");
      const result = catalogDetailResultSchema.parse(
        (await callTool("get_game", { slug: marked.slug, locale: "en" }))
          .structuredContent,
      );
      expect(result.game.title).toBe("Text-only Result");
      expect(result.game.tags).toEqual(["genre"]);
      expect(JSON.stringify(result)).not.toMatch(/<|https?:\/\//);
    });

    test.each([
      { q: "x".repeat(201) },
      { tags: Array(6).fill("action") },
      { tags: [""] },
      { tags: ["x".repeat(65)] },
      { page: 0 },
      { page: 101 },
      { page: 1.5 },
      { page: "1" },
      { limit: 0 },
      { limit: 21 },
      { locale: "es" },
      { min_price: 0 },
      { status: "PRIVATE" },
      { user_id: "someone" },
    ])("Rejects invalid/extra search arguments: %j", async (args) => {
      expect(await callTool("search_games", args)).toEqual({
        isError: true,
        content: [
          {
            type: "text",
            text: "Invalid catalog arguments. Check the tool's input schema.",
          },
        ],
      });
    });

    test("Rejects invalid detail arguments and unsupported write tools", async () => {
      expect((await callTool("get_game", { slug: "" })).isError).toBe(true);
      expect(
        (
          await callTool("get_game", {
            slug: active.slug,
            include_private: true,
          })
        ).isError,
      ).toBe(true);
      expect(await callTool("publish_review", {})).toEqual({
        isError: true,
        content: [
          {
            type: "text",
            text: "Unknown tool. Use search_games, get_game or get_game_reviews.",
          },
        ],
      });
    });

    test("Rejects an untrusted Origin before handling MCP", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/mcp`, {
        method: "POST",
        headers: {
          Origin: "https://untrusted.example.invalid",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(403);
    });

    test("Rejects malformed JSON and an untrusted Host", async () => {
      const malformed = await fetch(`${webserver.getOrigin()}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "{",
      });
      expect(malformed.status).toBe(400);
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          `${webserver.getOrigin()}/api/mcp`,
          {
            method: "POST",
            headers: {
              Host: "untrusted.example.invalid",
              "Content-Type": "application/json",
            },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on("error", reject);
        request.end(
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        );
      });
      expect(status).toBe(403);
    });

    test("Rejects oversized request bodies", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          padding: "x".repeat(33000),
        }),
      });
      expect(response.status).toBe(413);
    });
  });

  describe("Credentials sent to the public endpoint", () => {
    test("An admin cookie or arbitrary Bearer does not grant private visibility", async () => {
      const headers = {
        Cookie: adminCookie,
        Authorization: "Bearer synthetic-token",
      };
      expect(
        (await callTool("get_game", { slug: privateGame.slug }, headers))
          .isError,
      ).toBe(true);
      const data = catalogSearchResultSchema.parse(
        (await callTool("search_games", { q: "catalog" }, headers))
          .structuredContent,
      );
      expect(data.pagination.total).toBe(2);
      expect(data.games.map((game) => game.slug).sort()).toEqual(
        [active.slug, displayOnly.slug].sort(),
      );
    });
  });
});
