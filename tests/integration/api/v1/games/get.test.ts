import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/games", () => {
  describe("Anonymous user", () => {
    test("Should return 200 and a list of public games", async () => {
      // Create some games with different statuses
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);

      const game1 = await orchestrator.createGame(user.id, {
        title: "Action Game",
        tags: ["action"],
      });
      const game2 = await orchestrator.createGame(user.id, {
        title: "RPG Game",
        tags: ["rpg"],
      });
      await orchestrator.createGame(user.id, {
        title: "Private Game",
      });

      // Update statuses to ACTIVE to be visible
      const gameModel = (await import("models/game")).default;
      await gameModel.makePublic(game1.id);
      await gameModel.makePublic(game2.id);
      // game3 remains PRIVATE

      const response = await fetch(`${webserver.getOrigin()}/api/v1/games`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.games).toHaveLength(2);
      expect(body.pagination.total).toBe(2);

      const titles = body.games.map((g) => g.title);
      expect(titles).toContain("Action Game");
      expect(titles).toContain("RPG Game");
      expect(titles).not.toContain("Private Game");
    });

    test("Should filter by tags", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games?tags=action`,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.games).toHaveLength(1);
      expect(body.games[0].title).toBe("Action Game");
    });

    test("Should search by text (q)", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games?q=rpg`,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.games).toHaveLength(1);
      expect(body.games[0].title).toBe("RPG Game");
    });

    test("Should handle pagination", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games?limit=1`,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.games).toHaveLength(1);
      expect(body.pagination.pages).toBe(2);
    });
  });
});
