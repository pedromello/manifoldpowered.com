import orchestrator from "tests/orchestrator";
import gameModel from "models/game";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/items/games/[slug]", () => {
  describe("Anonymous user", () => {
    test("With valid slug should return 200 and game data", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const game = await orchestrator.createGame(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
      );

      // Assert
      expect(response.status).toBe(200);
      const responseBody = await response.json();

      expect(responseBody.id).toBe(game.id);
      expect(responseBody.slug).toBe(game.slug);
      expect(responseBody.title).toBe(game.title);
      expect(responseBody.description).toBe(game.description);
      // The API serialises Decimal to a fixed 2-decimal string.
      expect(responseBody.price).toBe(game.price.toFixed(2));
    });

    test("With non-existent slug should return 404", async () => {
      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/non-existent-game`,
      );

      // Assert
      expect(response.status).toBe(404);
      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "NotFoundError",
        message: 'The game with slug "non-existent-game" was not found.',
        action:
          "Check if the slug is correct or if the game is still available.",
        status_code: 404,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With valid slug should return 200 and game data", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          headers: {
            Cookie: `session_id=${session.token}`,
          },
        },
      );

      // Assert
      expect(response.status).toBe(200);
      const responseBody = await response.json();

      expect(responseBody.id).toBe(game.id);
      expect(responseBody.slug).toBe(game.slug);
    });
  });
  describe("Regional pricing", () => {
    test("Should attach display_price in the visitor's currency", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id, { price: 10 });
      await gameModel.setStatus(game.id, "ACTIVE");

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        { headers: { "x-vercel-ip-country": "BR" } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.display_price).toEqual({
        amount: "55.00",
        base_amount: null,
        currency: "BRL",
        symbol: "R$",
      });
    });

    test("Should return 404 where the game has no price in that currency", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      // No rate and no override: not purchasable in BRL.

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id, { price: 10 });
      await gameModel.setStatus(game.id, "ACTIVE");

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        { headers: { "x-vercel-ip-country": "BR" } },
      );

      // The detail page has to agree with the listings that hide it.
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: `The game with slug "${game.slug}" is not available in BRL.`,
        name: "NotFoundError",
        action:
          "Check back later, or browse the games available in your region.",
        status_code: 404,
      });
    });
  });
});
