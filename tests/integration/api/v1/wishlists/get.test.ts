import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/wishlists", () => {
  describe("Anonymous user", () => {
    test("Without slug parameter should return 400", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/wishlists`);

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.message).toBe("Query validation failed.");
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.action).toBe("Provide the 'slug' parameter in the query string.");
      expect(responseBody.status_code).toBe(400);
    });

    test("With anonymous user should return count and is_wishlisted false", async () => {
      const user = await orchestrator.createUser();
      const game = await orchestrator.createGame(user.id);

      await prisma.wishlistItem.create({
        data: { user_id: user.id, game_id: game.id },
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists?slug=${game.slug}`,
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.count).toBe(1);
      expect(responseBody.is_wishlisted).toBe(false);
    });
  });

  describe("Authenticated user", () => {
    test("With authenticated user who wishlisted the game should return count and is_wishlisted true", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      await prisma.wishlistItem.create({
        data: { user_id: user.id, game_id: game.id },
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists?slug=${game.slug}`,
        {
          headers: {
            Cookie: `session_id=${session.token}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.count).toBe(1);
      expect(responseBody.is_wishlisted).toBe(true);
    });
  });
});
