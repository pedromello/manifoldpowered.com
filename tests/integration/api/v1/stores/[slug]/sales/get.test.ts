import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/sales", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/sales`,
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: update:store",
        status_code: 403,
      });
    });
  });

  describe("Owner", () => {
    test("Should return sales attributed to that store", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const createdGame = await orchestrator.createGame(creator.id);

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      // Acquire once through this store.
      const storePurchase = await fetch(
        `${webserver.getOrigin()}/api/v1/library`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${buyerSession.token}`,
          },
          body: JSON.stringify({
            slug: createdGame.slug,
            store_slug: createdStore.slug,
          }),
        },
      );
      expect(storePurchase.status).toBe(201);

      // Acquire another game with no store context (should NOT show up here).
      const otherGame = await orchestrator.createGame(creator.id);
      const globalPurchase = await fetch(
        `${webserver.getOrigin()}/api/v1/library`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${buyerSession.token}`,
          },
          body: JSON.stringify({ slug: otherGame.slug }),
        },
      );
      expect(globalPurchase.status).toBe(201);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/sales`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.sales).toHaveLength(1);
      expect(responseBody.sales[0].game_id).toBe(createdGame.id);
      expect(responseBody.sales[0].game_title).toBe(createdGame.title);
      expect(responseBody.sales[0].store_id).toBe(createdStore.id);
      expect(responseBody.pagination.total).toBe(1);
    });
  });

  describe("Unrelated activated user", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/sales`,
        {
          headers: { Cookie: `session_id=${outsiderSession.token}` },
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to view this store's sales",
        action: "Verify if you are an administrator of this store",
        status_code: 403,
      });
    });
  });

  describe("Unknown store slug", () => {
    test("Should return 404 Not Found", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/does-not-exist/sales`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(404);
    });
  });
});
