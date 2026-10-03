import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameModel from "models/game";
import {
  catalogSearchResultSchema,
  catalogDetailResultSchema,
  catalogReviewsResultSchema,
  catalogSelectionResultSchema,
} from "models/public_game_catalog";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("Public catalog discovery over real MCP HTTP", () => {
  test("Search → factual detail → status change denies the next read, without login or writes", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const game = await orchestrator.createGame(owner.id, {
      title: "Exploration Catalog Journey",
      tags: ["exploration", "journey-fixture"],
    });
    await gameModel.setStatus(game.id, "ACTIVE");
    await orchestrator.createGame(owner.id, {
      title: "Hidden Exploration Journey",
      tags: ["exploration", "journey-fixture"],
    });
    const before = {
      reviews: await prisma.review.count(),
      users: await prisma.user.count(),
      games: await prisma.game.count(),
    };
    const client = new Client({
      name: "catalog-integration-test",
      version: "1.0.0",
    });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`${webserver.getOrigin()}/api/mcp`),
        ),
      );
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "search_games",
        "get_game",
        "get_game_reviews",
        "show_catalog",
      ]);
      const search = catalogSearchResultSchema.parse(
        (
          await client.callTool({
            name: "search_games",
            arguments: {
              q: "exploration",
              tags: ["journey-fixture"],
              locale: "pt-BR",
            },
          })
        ).structuredContent,
      );
      expect(search.games.map((item) => item.slug)).toEqual([game.slug]);
      expect(search.pagination.total).toBe(1);
      const selection = catalogSelectionResultSchema.parse(
        (
          await client.callTool({
            name: "show_catalog",
            arguments: {
              view: "list",
              slugs: search.games.map((game) => game.slug),
              tags: ["journey-fixture"],
              locale: "pt-BR",
            },
          })
        ).structuredContent,
      );
      expect(selection.games).toEqual(search.games);
      const detail = catalogDetailResultSchema.parse(
        (
          await client.callTool({
            name: "get_game",
            arguments: { slug: search.games[0].slug, locale: "pt-BR" },
          })
        ).structuredContent,
      );
      const { matching_tags, ...selected } = search.games[0];
      expect(matching_tags).toEqual(["journey-fixture"]);
      expect(detail.game).toEqual(selected);
      expect(detail.game.title).toBe("Exploration Catalog Journey");
      const reviews = catalogReviewsResultSchema.parse(
        (
          await client.callTool({
            name: "get_game_reviews",
            arguments: { slug: game.slug },
          })
        ).structuredContent,
      );
      expect(reviews.reviews).toEqual([]);
      expect(
        catalogDetailResultSchema.parse(
          (
            await client.callTool({
              name: "show_catalog",
              arguments: {
                view: "detail",
                slugs: [game.slug],
                locale: "pt-BR",
              },
            })
          ).structuredContent,
        ),
      ).toEqual(detail);
      expect(
        catalogReviewsResultSchema.parse(
          (
            await client.callTool({
              name: "show_catalog",
              arguments: { view: "reviews", slugs: [game.slug] },
            })
          ).structuredContent,
        ),
      ).toEqual(reviews);
      const resources = await client.listResources();
      expect(resources.resources[0].uri).toBe(
        "ui://manifold/game-card/v4.html",
      );
      expect(
        (await client.readResource({ uri: resources.resources[0].uri }))
          .contents[0].mimeType,
      ).toBe("text/html;profile=mcp-app");
      await gameModel.setStatus(game.id, "PRIVATE");
      for (const view of ["list", "detail", "reviews"])
        expect(
          (
            await client.callTool({
              name: "show_catalog",
              arguments: { view, slugs: [game.slug] },
            })
          ).isError,
        ).toBe(true);
      expect(
        (
          await client.callTool({
            name: "get_game_reviews",
            arguments: { slug: game.slug },
          })
        ).isError,
      ).toBe(true);
      const hidden = await client.callTool({
        name: "get_game",
        arguments: { slug: game.slug },
      });
      expect(hidden.isError).toBe(true);
      expect(hidden.content).toEqual([
        { type: "text", text: "Game not found." },
      ]);
      expect(
        catalogSearchResultSchema.parse(
          (
            await client.callTool({
              name: "search_games",
              arguments: { q: "exploration" },
            })
          ).structuredContent,
        ).pagination.total,
      ).toBe(0);
      expect({
        reviews: await prisma.review.count(),
        users: await prisma.user.count(),
        games: await prisma.game.count(),
      }).toEqual(before);
    } finally {
      await client.close();
    }
  });
});
