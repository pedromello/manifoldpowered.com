import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function getPurchases(sessionToken, query = "") {
  return await fetch(
    `${webserver.getOrigin()}/api/v1/user/purchases${query}`,
    sessionToken
      ? { headers: { Cookie: `session_id=${sessionToken}` } }
      : undefined,
  );
}

async function acquire(sessionToken, gameSlug, storeSlug = undefined) {
  const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify({
      slug: gameSlug,
      ...(storeSlug ? { store_slug: storeSlug } : {}),
    }),
  });
  expect(response.status).toBe(201);
  return response;
}

async function createDeveloperWithGame() {
  const developer = await orchestrator.createUser();
  await orchestrator.activateUser(developer.id);
  return await orchestrator.createGame(developer.id);
}

describe("GET /api/v1/user/purchases", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await getPurchases();

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: read:own_sale",
        status_code: 403,
      });
    });
  });

  describe("Activated user", () => {
    test("Should return an empty page when nothing has been bought", async () => {
      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      const response = await getPurchases(buyerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        purchases: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });
    });

    // What a buyer is entitled to see, and the only surface that shows it:
    // read:library reports the game's current list price, not what they paid.
    test("Should return what they paid, in the currency they were charged", async () => {
      const game = await createDeveloperWithGame();

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      await acquire(buyerSession.token, game.slug);

      const response = await getPurchases(buyerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.purchases).toHaveLength(1);

      const [purchase] = responseBody.purchases;
      expect(purchase.game_id).toBe(game.id);
      expect(purchase.game_title).toBe(game.title);
      expect(purchase.game_slug).toBe(game.slug);
      expect(purchase.currency).toBe("USD");
      // Two decimals, the display scale — a buyer reconciles this against a
      // card statement, not against the ledger.
      expect(purchase.price_at_sale).toMatch(/^\d+\.\d{2}$/);
      expect(typeof purchase.created_at).toBe("string");
      // A global-storefront purchase is attributed to no outlet.
      expect(purchase.store_id).toBeNull();
    });

    test("Should record the outlet they bought through", async () => {
      const game = await createDeveloperWithGame();
      await gameModel.makePublic(game.id);

      const referrer = await orchestrator.createUser();
      await orchestrator.activateUser(referrer.id);
      const outlet = await orchestrator.createStore(referrer.id);

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      await acquire(buyerSession.token, game.slug, outlet.slug);

      const response = await getPurchases(buyerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.purchases[0]).toMatchObject({
        store_id: outlet.id,
        store_name: outlet.name,
        store_slug: outlet.slug,
        store_logo_url: outlet.logo_url,
      });
    });

    // There is no id in the request, so this is what proves the scoping rather
    // than a tampering test: two buyers, and neither sees the other.
    test("Should not return another buyer's purchases", async () => {
      const mineGame = await createDeveloperWithGame();
      const theirsGame = await createDeveloperWithGame();

      const mine = await orchestrator.createUser();
      await orchestrator.activateUser(mine.id);
      const mineSession = await orchestrator.createSession(mine.id);

      const theirs = await orchestrator.createUser();
      await orchestrator.activateUser(theirs.id);
      const theirsSession = await orchestrator.createSession(theirs.id);

      await acquire(mineSession.token, mineGame.slug);
      await acquire(theirsSession.token, theirsGame.slug);

      const response = await getPurchases(mineSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.purchases).toHaveLength(1);
      expect(responseBody.purchases[0].game_id).toBe(mineGame.id);
    });

    test("Should return the most recent purchase first", async () => {
      const firstGame = await createDeveloperWithGame();
      const secondGame = await createDeveloperWithGame();

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      await acquire(buyerSession.token, firstGame.slug);
      await acquire(buyerSession.token, secondGame.slug);

      const response = await getPurchases(buyerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.purchases).toHaveLength(2);
      expect(responseBody.pagination.total).toBe(2);
    });

    test("Should paginate", async () => {
      const firstGame = await createDeveloperWithGame();
      const secondGame = await createDeveloperWithGame();

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      await acquire(buyerSession.token, firstGame.slug);
      await acquire(buyerSession.token, secondGame.slug);

      const response = await getPurchases(
        buyerSession.token,
        "?page=2&limit=1",
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.purchases).toHaveLength(1);
      expect(responseBody.pagination).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        pages: 2,
      });
    });
  });

  describe("Invalid query parameters", () => {
    test("Should return 400 Bad Request", async () => {
      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      const response = await getPurchases(buyerSession.token, "?limit=1000");

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid query parameters");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
