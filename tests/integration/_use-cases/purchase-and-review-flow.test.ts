import { Game, User, Session } from "generated/prisma/client";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";
import retry from "async-retry";

const testClientAddress = orchestrator.createTestClientAddress(
  "purchase-and-review-flow",
);

async function waitForActivationId(recipient: string): Promise<string> {
  // SMTP delivery can finish before Mailcatcher's HTTP index exposes it.
  // The previous user's message must never activate the next account.
  return retry(
    async () => {
      const lastEmail = await orchestrator.getLastEmail();
      expect(lastEmail?.recipients).toContain(`<${recipient}>`);
      const activationId = orchestrator.extractUUID(lastEmail.text);
      expect(activationId).toEqual(expect.any(String));
      return activationId;
    },
    { retries: 10, minTimeout: 100, maxTimeout: 1000, factor: 1.5 },
  );
}

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
  await orchestrator.clearStorage();
});

describe("Use case: Purchase and Review Flow", () => {
  let seller: User;
  let sellerSession: Session;
  let sellerStudioId: string;
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

      const activationId = await waitForActivationId(sellerData.email);
      const activationResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
        {
          method: "PATCH",
        },
      );
      expect(activationResponse.status).toBe(200);

      // Grant developer features
      await orchestrator.addFeaturesToUser(seller.id, [
        "create:game",
        "create:game_file",
      ]);

      const loginResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": testClientAddress,
          },
          body: JSON.stringify({
            email: sellerData.email,
            password: sellerData.password,
          }),
        },
      );
      expect(loginResponse.status).toBe(201);
      sellerSession = await loginResponse.json();
    });

    test("Seller registers a studio", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sellerSession.token}`,
        },
        body: JSON.stringify({ name: "Test Developer" }),
      });

      expect(response.status).toBe(201);
      const createdStudio = await response.json();
      sellerStudioId = createdStudio.id;
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
            studio_id: sellerStudioId,
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

      const activationId = await waitForActivationId(buyerData.email);
      const activationResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
        {
          method: "PATCH",
        },
      );
      expect(activationResponse.status).toBe(200);

      const loginResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": testClientAddress,
          },
          body: JSON.stringify({
            email: buyerData.email,
            password: buyerData.password,
          }),
        },
      );
      expect(loginResponse.status).toBe(201);
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
