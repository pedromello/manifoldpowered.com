import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/reviews", () => {
  describe("Anonymous user", () => {
    test("With anonymous user should return 403", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "some-game-slug",
          message: "Great",
          recommended: true,
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated user", () => {
    test("With valid positive review should return 201 and update game stats", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          slug: game.slug,
          message: "Amazing game!",
          recommended: true,
        }),
      });

      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.message).toBe("Review posted successfully");

      const review = await prisma.review.findUnique({
        where: { user_id_game_id: { user_id: user.id, game_id: game.id } },
      });
      expect(review).toBeDefined();
      expect(review?.recommended).toBe(true);

      const updatedGame = await prisma.game.findUnique({
        where: { id: game.id },
      });
      expect(updatedGame?.positive_reviews).toBe(1);
      expect(updatedGame?.negative_reviews).toBe(0);
      expect(updatedGame?.review_score).toBe("POSITIVE");
    });

    test("With duplicate review should return 400 ValidationError", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          slug: game.slug,
          message: "Amazing game!",
          recommended: true,
        }),
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          slug: game.slug,
          message: "Actually, it's ok.",
          recommended: false,
        }),
      });

      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("You have already reviewed this game.");

      const reviews = await prisma.review.findMany({
        where: { game_id: game.id },
      });
      expect(reviews.length).toBe(1);
    });

    test("With invalid body should return 400", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });
});
