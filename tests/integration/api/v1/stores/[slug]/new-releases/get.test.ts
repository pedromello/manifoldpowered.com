import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/new-releases", () => {
  describe("Anonymous user", () => {
    test("For an unknown store should return 404", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/does-not-exist/new-releases`,
      );

      expect(response.status).toBe(404);
    });

    test("Should order by launch date and apply curation rules", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const olderGame = await orchestrator.createGame(owner.id, {
        title: "Older Release",
        tags: ["rpg"],
        launch_date: new Date("2020-01-01"),
      });
      await gameModel.makePublic(olderGame.id);

      const newerGame = await orchestrator.createGame(owner.id, {
        title: "Newer Release",
        tags: ["rpg"],
        launch_date: new Date("2025-01-01"),
      });
      await gameModel.makePublic(newerGame.id);

      const bannedGame = await orchestrator.createGame(owner.id, {
        title: "Banned Release",
        tags: ["horror"],
        launch_date: new Date("2026-01-01"),
      });
      await gameModel.makePublic(bannedGame.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "horror",
        "BLACKLIST",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/new-releases`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).not.toContain("Banned Release");
      expect(titles.indexOf("Newer Release")).toBeLessThan(
        titles.indexOf("Older Release"),
      );
    });
  });
});
