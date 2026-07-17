import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/stores/[slug]/game-overrides/[gameSlug]", () => {
  describe("Owner", () => {
    test("Should remove the game override and return 200", async () => {
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
        "HIDE",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides/${targetGame.slug}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const listResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );
      const listBody = await listResponse.json();
      expect(listBody).toHaveLength(0);
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
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
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
        "HIDE",
      );

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides/${targetGame.slug}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${outsiderSession.token}` },
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
