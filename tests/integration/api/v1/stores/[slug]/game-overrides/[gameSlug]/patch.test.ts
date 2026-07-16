import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/stores/[slug]/game-overrides/[gameSlug]", () => {
  describe("Owner", () => {
    test("With valid visibility should update the override and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const targetGame = await orchestrator.createGame(developer.id);
      await orchestrator.addStoreGameOverride(
        createdStore.id,
        targetGame.slug,
        "SHOW",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides/${targetGame.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ visibility: "HIDE" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        store_id: createdStore.id,
        game_id: targetGame.id,
        game_slug: targetGame.slug,
        visibility: "HIDE",
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });
    });

    test("For a game with no override should return 404", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const targetGame = await orchestrator.createGame(developer.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides/${targetGame.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ visibility: "HIDE" }),
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Unrelated activated user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const targetGame = await orchestrator.createGame(developer.id);
      await orchestrator.addStoreGameOverride(
        createdStore.id,
        targetGame.slug,
        "SHOW",
      );

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides/${targetGame.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({ visibility: "HIDE" }),
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
