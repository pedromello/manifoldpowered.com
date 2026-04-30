import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { version as uuidVersion } from "uuid";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

describe("POST /api/v1/library", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        body: JSON.stringify({
          game_id: "00000000-0000-0000-0000-000000000000",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:library",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user (unactivated)", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game_id: "00000000-0000-0000-0000-000000000000",
        }),
      });

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:library",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user (activated)", () => {
    test("With game not found should return 404 Not Found", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: "non-existent-game",
        }),
      });

      expect(response.status).toBe(404);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Game not found",
        name: "NotFoundError",
        action: "Verify the game exists",
        status_code: 404,
      });
    });

    test("With valid slug should return 201 Created", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id);

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          Cookie: `session_id=${buyerSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: game.slug,
        }),
      });

      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        game_id: game.id,
        user_id: buyer.id,
        acquired_at: responseBody.acquired_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(uuidVersion(responseBody.game_id)).toBe(4);
      expect(uuidVersion(responseBody.user_id)).toBe(4);

      expect(Date.parse(responseBody.acquired_at)).not.toBeNaN();
    });
  });
});
