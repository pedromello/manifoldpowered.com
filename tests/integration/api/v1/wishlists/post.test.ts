import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/wishlists", () => {
  describe("Anonymous user", () => {
    test("With anonymous user should return 403", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/wishlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "some-game-slug" }),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:wishlist",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With valid slug should add to wishlist and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/wishlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.message).toBe("Game added to wishlist");

      const wishlistItem = await prisma.wishlistItem.findUnique({
        where: {
          user_id_game_id: {
            user_id: user.id,
            game_id: game.id,
          },
        },
      });

      expect(wishlistItem).toBeDefined();
    });

    test("With invalid body should return 400", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/wishlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const responseBody = await response.json();
      
      expect(responseBody.message).toBe("Request body validation failed.");
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.action).toBe("Provide the 'slug' in the request body.");
      expect(responseBody.status_code).toBe(400);
    });

    test("With game already wishlisted should remain idempotent and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      // First request
      await fetch(`${webserver.getOrigin()}/api/v1/wishlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      // Second request
      const response = await fetch(`${webserver.getOrigin()}/api/v1/wishlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      expect(response.status).toBe(201);

      const wishlistItems = await prisma.wishlistItem.findMany({
        where: {
          user_id: user.id,
          game_id: game.id,
        },
      });

      // Ensure only 1 record exists
      expect(wishlistItems.length).toBe(1);
    });
  });
});
