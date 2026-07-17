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

    test("With invalid order value should return 400", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games?order=not_a_real_order`,
      );
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });

    describe("Advanced filters", () => {
      test("Should filter by min_price and max_price", async () => {
        const user = await orchestrator.createUser();
        await orchestrator.activateUser(user.id);

        const gameModel = (await import("models/game")).default;

        const budgetGame = await orchestrator.createGame(user.id, {
          title: "Budget Bundle",
          tags: ["indie"],
          price: 5,
        });
        const midRangeGame = await orchestrator.createGame(user.id, {
          title: "Midrange Adventure",
          tags: ["indie"],
          price: 50,
        });
        const premiumGame = await orchestrator.createGame(user.id, {
          title: "Premium Epic",
          tags: ["indie"],
          price: 500,
        });
        await gameModel.makePublic(budgetGame.id);
        await gameModel.makePublic(midRangeGame.id);
        await gameModel.makePublic(premiumGame.id);

        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/games?min_price=40&max_price=60`,
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const titles = body.games.map((g) => g.title);
        expect(titles).toEqual(["Midrange Adventure"]);
      });

      test("Should combine a tag filter with max_price", async () => {
        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/games?tags=indie&max_price=10`,
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const titles = body.games.map((g) => g.title);
        expect(titles).toEqual(["Budget Bundle"]);
      });

      test("With invalid min_price value should return 400", async () => {
        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/games?min_price=not-a-number`,
        );
        expect(response.status).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.name).toBe("ValidationError");
      });

      test("With min_price greater than max_price should return 400", async () => {
        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/games?min_price=100&max_price=10`,
        );
        expect(response.status).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.name).toBe("ValidationError");
      });

      test("Should order results using sort_by as an alias for order", async () => {
        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/games?tags=indie&sort_by=price_desc`,
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const titles = body.games.map((g) => g.title);
        expect(titles).toEqual([
          "Premium Epic",
          "Midrange Adventure",
          "Budget Bundle",
        ]);
      });

      test("sort_by should take precedence when both order and sort_by are provided", async () => {
        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/games?tags=indie&order=price_asc&sort_by=price_desc`,
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const titles = body.games.map((g) => g.title);
        expect(titles).toEqual([
          "Premium Epic",
          "Midrange Adventure",
          "Budget Bundle",
        ]);
      });
    });
  });
});
