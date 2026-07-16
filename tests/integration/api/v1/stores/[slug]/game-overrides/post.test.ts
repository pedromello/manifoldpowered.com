import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/stores/[slug]/game-overrides", () => {
  describe("Anonymous user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);
      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const targetGame = await orchestrator.createGame(developer.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_slug: targetGame.slug,
            visibility: "HIDE",
          }),
        },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Owner", () => {
    test("With valid body should create a game override and return 201", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const targetGame = await orchestrator.createGame(developer.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            game_slug: targetGame.slug,
            visibility: "SHOW",
          }),
        },
      );

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        store_id: createdStore.id,
        game_id: targetGame.id,
        game_slug: targetGame.slug,
        visibility: "SHOW",
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });
    });

    test("For an unknown game slug should return 404", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            game_slug: "does-not-exist",
            visibility: "SHOW",
          }),
        },
      );

      expect(response.status).toBe(404);
    });

    test("Adding an override twice for the same game should return 400", async () => {
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
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            game_slug: targetGame.slug,
            visibility: "HIDE",
          }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });
  });

  describe("Unrelated activated user", () => {
    test("Targeting a store they do not administer should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const targetGame = await orchestrator.createGame(developer.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/game-overrides`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({
            game_slug: targetGame.slug,
            visibility: "HIDE",
          }),
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
