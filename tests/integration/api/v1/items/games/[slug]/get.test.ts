import orchestrator from "tests/orchestrator";
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
      expect(responseBody.price).toBe(game.price);
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
});
