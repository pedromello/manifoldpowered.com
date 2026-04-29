import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/wishlists", () => {
  describe("Anonymous user", () => {
    test("With anonymous user should return 403", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: "some-game-slug" }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: delete:wishlist",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With authenticated user should remove from wishlist and return 200", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      await prisma.wishlistItem.create({
        data: {
          user_id: user.id,
          game_id: game.id,
        },
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ slug: game.slug }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.message).toBe("Game removed from wishlist");

      const wishlistItem = await prisma.wishlistItem.findUnique({
        where: {
          user_id_game_id: {
            user_id: user.id,
            game_id: game.id,
          },
        },
      });

      expect(wishlistItem).toBeNull();
    });
  });
});
