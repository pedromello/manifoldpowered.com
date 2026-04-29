import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/reviews", () => {
  describe("Anonymous user", () => {
    test("With anonymous user should return 403", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "some-game-slug" }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated user", () => {
    test("With valid review should delete and update game stats", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      await prisma.review.create({
        data: {
          user_id: user.id,
          game_id: game.id,
          message: "Will be deleted",
          recommended: true,
        },
      });
      await prisma.game.update({
        where: { id: game.id },
        data: { positive_reviews: 1, review_score: "POSITIVE" },
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      expect(response.status).toBe(200);

      const review = await prisma.review.findUnique({
        where: { user_id_game_id: { user_id: user.id, game_id: game.id } },
      });
      expect(review).toBeNull();

      const updatedGame = await prisma.game.findUnique({
        where: { id: game.id },
      });
      expect(updatedGame?.positive_reviews).toBe(0);
      expect(updatedGame?.review_score).toBe("MIXED");
    });

    test("With nonexistent review should return 404", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      expect(response.status).toBe(404);
    });
  });
});
