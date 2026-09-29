import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

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
      await gameModel.makePublic(createdGame.id);

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

  // docs/legal/business-description.md, the text handed to payment processors,
  // states that affiliates receive no consumer personal data. Nothing enforced
  // that until these three tests: the endpoint used to return the buyer's
  // user_id, which read:review resolves to a username for anyone who asks.
  describe("Buyer privacy", () => {
    // Seeds one purchase through `store` and returns the sale row the outlet
    // owner sees.
    async function saleAsSeenBy(store, ownerSession, buyerSession, gameSlug) {
      const purchase = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${buyerSession.token}`,
        },
        body: JSON.stringify({ slug: gameSlug, store_slug: store.slug }),
      });
      expect(purchase.status).toBe(201);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${store.slug}/sales`,
        { headers: { Cookie: `session_id=${ownerSession.token}` } },
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      return { responseBody, sale: responseBody.sales[0] };
    }

    async function createOutlet() {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const session = await orchestrator.createSession(owner.id);
      const store = await orchestrator.createStore(owner.id);
      return { store, session };
    }

    async function createBuyer() {
      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const session = await orchestrator.createSession(buyer.id);
      return { buyer, session };
    }

    test("Should return a pseudonym instead of the buyer's id", async () => {
      const outlet = await createOutlet();
      const { buyer, session: buyerSession } = await createBuyer();

      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id);
      await gameModel.makePublic(game.id);

      const { responseBody, sale } = await saleAsSeenBy(
        outlet.store,
        outlet.session,
        buyerSession,
        game.slug,
      );

      expect(sale).not.toHaveProperty("user_id");
      expect(sale.buyer_ref).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(responseBody)).not.toContain(buyer.id);
      expect(JSON.stringify(responseBody)).not.toContain(buyer.username);
    });

    // Repeat-customer analysis inside one outlet is the legitimate use the raw
    // id was serving, so the pseudonym has to stay put across purchases.
    test("Should give one buyer a stable pseudonym within an outlet", async () => {
      const outlet = await createOutlet();
      const { session: buyerSession } = await createBuyer();

      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const firstGame = await orchestrator.createGame(creator.id);
      const secondGame = await orchestrator.createGame(creator.id);
      await gameModel.makePublic(firstGame.id);
      await gameModel.makePublic(secondGame.id);

      await saleAsSeenBy(
        outlet.store,
        outlet.session,
        buyerSession,
        firstGame.slug,
      );
      const { responseBody } = await saleAsSeenBy(
        outlet.store,
        outlet.session,
        buyerSession,
        secondGame.slug,
      );

      expect(responseBody.sales).toHaveLength(2);
      expect(responseBody.sales[0].buyer_ref).toBe(
        responseBody.sales[1].buyer_ref,
      );
    });

    // Salted by the outlet, so two operators comparing notes cannot work out
    // that they share a customer.
    test("Should give one buyer different pseudonyms at different outlets", async () => {
      const firstOutlet = await createOutlet();
      const secondOutlet = await createOutlet();
      const { session: buyerSession } = await createBuyer();

      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const firstGame = await orchestrator.createGame(creator.id);
      const secondGame = await orchestrator.createGame(creator.id);
      await gameModel.makePublic(firstGame.id);
      await gameModel.makePublic(secondGame.id);

      const first = await saleAsSeenBy(
        firstOutlet.store,
        firstOutlet.session,
        buyerSession,
        firstGame.slug,
      );
      const second = await saleAsSeenBy(
        secondOutlet.store,
        secondOutlet.session,
        buyerSession,
        secondGame.slug,
      );

      expect(first.sale.buyer_ref).not.toBe(second.sale.buyer_ref);
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
