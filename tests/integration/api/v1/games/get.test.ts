import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";
import currencyModel from "models/currency";

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
  describe("Regional pricing", () => {
    async function setupPricedGame(priceInUsd = 10) {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id, {
        price: priceInUsd,
      });
      await gameModel.setStatus(game.id, "ACTIVE");

      return game;
    }

    function listAs(country?: string) {
      return fetch(`${webserver.getOrigin()}/api/v1/games`, {
        headers: country ? { "x-vercel-ip-country": country } : {},
      });
    }

    test("Without a region header should price in the base currency", async () => {
      await setupPricedGame(10);

      const response = await listAs();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.currency).toBe("USD");
      expect(body.games[0].display_price).toEqual({
        amount: "10.00",
        base_amount: null,
        currency: "USD",
        symbol: "$",
      });
      // price stays the USD base, so this is additive for existing clients.
      expect(body.games[0].price).toBe("10.00");
    });

    test("With a Brazilian region and a rate should price in BRL", async () => {
      await setupPricedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const body = await (await listAs("BR")).json();

      expect(body.currency).toBe("BRL");
      expect(body.games[0].display_price).toEqual({
        amount: "55.00",
        base_amount: null,
        currency: "BRL",
        symbol: "R$",
      });
    });

    test("An override wins over the rate", async () => {
      const game = await setupPricedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const body = await (await listAs("BR")).json();

      expect(body.games[0].display_price.amount).toBe("49.90");
    });

    test("With no rate and no override the game is hidden from the region", async () => {
      await setupPricedGame(10);

      const body = await (await listAs("BR")).json();

      expect(body.currency).toBe("BRL");
      expect(body.games).toHaveLength(0);
      // Pagination reflects the constrained query rather than a filtered page.
      expect(body.pagination.total).toBe(0);
    });

    test("With no rate, only games priced explicitly in BRL are listed", async () => {
      const priced = await setupPricedGame(10);
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const unpriced = await orchestrator.createGame(owner.id, { price: 20 });
      await gameModel.setStatus(unpriced.id, "ACTIVE");

      await orchestrator.setGamePriceOverride(priced.id, "BRL", 49.9);

      const body = await (await listAs("BR")).json();

      expect(body.games.map((g) => g.id)).toEqual([priced.id]);
      expect(body.pagination.total).toBe(1);
    });

    test("A disabled currency falls back to the base currency", async () => {
      await setupPricedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await currencyModel.setEnabled("BRL", false);

      const body = await (await listAs("BR")).json();

      expect(body.currency).toBe("USD");
      expect(body.games[0].display_price.currency).toBe("USD");
    });

    test("An unmapped region falls back to the base currency", async () => {
      await setupPricedGame(10);

      const body = await (await listAs("AQ")).json();

      expect(body.currency).toBe("USD");
    });

    test("An ungeolocatable request falls back to the base currency", async () => {
      await setupPricedGame(10);

      // Vercel sends XX when it cannot place the request.
      const body = await (await listAs("XX")).json();

      expect(body.currency).toBe("USD");
    });
  });
});
