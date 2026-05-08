import { Game, User, Session } from "generated/prisma/client";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
  await orchestrator.clearStorage();
});

describe("Use case: Purchase and Review Flow", () => {
  let seller: User;
  let sellerSession: Session;
  let buyer: User;
  let buyerSession: Session;
  let game: Game;
  let foundGame: Game;

  describe("User A (Seller) registers a game", () => {
    test("Register and activate Seller", async () => {
      const sellerData = {
        username: "seller-user",
        email: "seller@manifoldpowered.com",
        password: "seller-password",
      };

      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sellerData),
      });

      expect(response.status).toBe(201);
      seller = await response.json();

      const lastEmail = await orchestrator.getLastEmail();
      const activationId = orchestrator.extractUUID(lastEmail.text);
      await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
        {
          method: "PATCH",
        },
      );

      // Grant developer features
      await orchestrator.addFeaturesToUser(seller.id, [
        "create:game",
        "create:game_file",
      ]);

      const loginResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: sellerData.email,
            password: sellerData.password,
          }),
        },
      );
      sellerSession = await loginResponse.json();
    });

    test("Seller registers a new game", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sellerSession.token}`,
          },
          body: JSON.stringify({
            slug: "test-game-review-flow",
            title: "Test Game Review Flow",
            description: "A game to test the purchase and review flow",
            detailed_description:
              "A game to test the purchase and review flow (detailed)",
            developer_name: "Test Developer",
            price: 10.0,
            launch_date: new Date().toISOString(),
          }),
        },
      );

      expect(response.status).toBe(201);
      const createdGame = await response.json();

      // Activate the game so it's visible in the showcase
      game = await gameModel.makePublic(createdGame.id);
    });
  });

  describe("User B (Buyer) buys and reviews the game", () => {
    test("Register and activate Buyer", async () => {
      const buyerData = {
        username: "buyer-user",
        email: "buyer@manifoldpowered.com",
        password: "buyer-password",
      };

      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buyerData),
      });

      expect(response.status).toBe(201);
      buyer = await response.json();

      const lastEmail = await orchestrator.getLastEmail();
      const activationId = orchestrator.extractUUID(lastEmail.text);
      await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
        {
          method: "PATCH",
        },
      );

      const loginResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: buyerData.email,
            password: buyerData.password,
          }),
        },
      );
      buyerSession = await loginResponse.json();
    });

    test("Buyer searches for games", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/games`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.games.length).toBeGreaterThan(0);
      foundGame = body.games.find((g: Game) => g.slug === game.slug);

      expect(foundGame).not.toBeUndefined();
      expect(foundGame.id).toEqual(game.id);
      expect(foundGame.slug).toEqual(game.slug);
    });

    test("Buyer adds game to library", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${buyerSession.token}`,
        },
        body: JSON.stringify({
          slug: foundGame.slug,
        }),
      });

      expect(response.status).toBe(201);
    });

    test("Buyer posts a review for the game", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${buyerSession.token}`,
        },
        body: JSON.stringify({
          slug: foundGame.slug,
          message: "This game is a masterpiece! Must play.",
          recommended: true,
        }),
      });

      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.message).toBe("Review posted successfully");
    });

    test("Buyer checks the game's reviews to see their review", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/reviews?slug=${foundGame.slug}&page=1&limit=10`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();

      expect(responseBody.pagination.total_items).toBe(1);
      expect(responseBody.reviews.length).toBe(1);
      
      const review = responseBody.reviews[0];
      expect(review.message).toBe("This game is a masterpiece! Must play.");
      expect(review.recommended).toBe(true);
      expect(review.user.username).toBe(buyer.username);
    });
  });
});
