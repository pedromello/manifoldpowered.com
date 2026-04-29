import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/reviews", () => {
  describe("Anonymous user", () => {
    test("With valid slug should return paginated reviews", async () => {
      const gameCreator = await orchestrator.createUser();
      const game = await orchestrator.createGame(gameCreator.id);
      
      const user1 = await orchestrator.createUser({ username: "reviewer1", email: "rev1@mail.com" });
      const user2 = await orchestrator.createUser({ username: "reviewer2", email: "rev2@mail.com" });

      await prisma.review.createMany({
        data: [
          { user_id: user1.id, game_id: game.id, message: "Review 1", recommended: true },
          { user_id: user2.id, game_id: game.id, message: "Review 2", recommended: false },
        ]
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews?slug=${game.slug}&page=1&limit=1`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      
      expect(responseBody.pagination.total_items).toBe(2);
      expect(responseBody.pagination.current_page).toBe(1);
      expect(responseBody.pagination.items_per_page).toBe(1);
      
      expect(responseBody.reviews.length).toBe(1);
      expect(responseBody.reviews[0].message).toBeDefined();
      expect(responseBody.reviews[0].user.username).toBeDefined();
      expect(responseBody.reviews[0].user.email).toBeUndefined();
    });

    test("With invalid slug should return 404", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews?slug=not-found`, {
        method: "GET",
      });

      expect(response.status).toBe(404);
    });
  });
});
