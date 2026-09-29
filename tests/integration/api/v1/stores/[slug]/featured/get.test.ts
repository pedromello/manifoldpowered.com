import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/featured", () => {
  describe("Anonymous user", () => {
    test("For an unknown store should return 404", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/does-not-exist/featured`,
      );

      expect(response.status).toBe(404);
    });

    test("Should apply the store's curation rules", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id, {
        catalog_mode: "ALL",
      });

      const allowedGames = await Promise.all(
        ["Featured Allowed", "Second Allowed", "Third Allowed"].map(
          async (title) => {
            const allowedGame = await orchestrator.createGame(owner.id, {
              title,
              tags: ["rpg"],
            });
            await gameModel.makePublic(allowedGame.id);
            return allowedGame;
          },
        ),
      );

      const bannedGame = await orchestrator.createGame(owner.id, {
        title: "Featured Banned",
        tags: ["horror"],
      });
      await gameModel.makePublic(bannedGame.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "horror",
        "BLACKLIST",
      );
      await orchestrator.publishStore(createdStore.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/featured`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.mode).toBe("AUTOMATIC");
      expect(body.games).toHaveLength(3);
      expect(
        body.games.every(
          (game: { featured_source: string }) =>
            game.featured_source === "AUTOMATIC",
        ),
      ).toBe(true);
      expect(
        body.games.every(
          (game: Record<string, unknown>) => !("recommendation_reason" in game),
        ),
      ).toBe(true);
      const titles = body.games.map((g: { title: string }) => g.title);
      allowedGames.forEach((allowedGame) =>
        expect(titles).toContain(allowedGame.title),
      );
      expect(titles).not.toContain("Featured Banned");
    });

    test("returns Outlet reviews from the published snapshot for automatic slides", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id, {
        catalog_mode: "ALL",
      });
      const games = await Promise.all(
        [
          "Featured Review Snapshot",
          "Featured Review Plain",
          "Featured Review Third",
        ].map(async (title) => {
          const createdGame = await orchestrator.createGame(owner.id, {
            title,
          });
          await gameModel.makePublic(createdGame.id);
          return createdGame;
        }),
      );
      await prisma.storeGameEditorial.create({
        data: {
          store_id: createdStore.id,
          game_id: games[0].id,
          headline: "Featured headline",
          body: "Review frozen into the public Featured snapshot.",
        },
      });
      await orchestrator.publishStore(createdStore.id, owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/featured`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.games).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: games[0].id,
            outlet_review: {
              headline: "Featured headline",
              body: "Review frozen into the public Featured snapshot.",
            },
          }),
          expect.objectContaining({ id: games[1].id, outlet_review: null }),
        ]),
      );
    });
  });
});
