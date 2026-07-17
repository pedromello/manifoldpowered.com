import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/trending", () => {
  describe("Anonymous user", () => {
    test("For an unknown store should return 404", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/does-not-exist/trending`,
      );

      expect(response.status).toBe(404);
    });

    test("Should apply the store's curation rules", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const forcedGame = await orchestrator.createGame(owner.id, {
        title: "Trending Forced",
        tags: ["horror"],
      });
      await gameModel.makePublic(forcedGame.id);

      const bannedGame = await orchestrator.createGame(owner.id, {
        title: "Trending Banned",
        tags: ["horror"],
      });
      await gameModel.makePublic(bannedGame.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "horror",
        "BLACKLIST",
      );
      await orchestrator.addStoreGameOverride(
        createdStore.id,
        forcedGame.slug,
        "SHOW",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/trending`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Trending Forced");
      expect(titles).not.toContain("Trending Banned");
    });
  });
});
