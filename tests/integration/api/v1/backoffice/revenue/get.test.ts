import orchestrator from "tests/orchestrator";
import library from "models/library";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

// The totals are the whole book, so every test needs an empty one to start
// from — otherwise the previous test's sale is part of this test's answer.
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function getRevenue(sessionToken?: string, query = "") {
  return await fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/revenue${query}`,
    {
      headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
    },
  );
}

// One sale of a known price, optionally attributed to an outlet. Acquired
// through the model rather than the API so the buyer needs no session, matching
// the statement suite.
async function seedSale({ price = 100, withOutlet = false } = {}) {
  const developer = await orchestrator.createUser();
  const game = await orchestrator.createGame(developer.id, { price });

  let store = null;
  if (withOutlet) {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    store = await orchestrator.createStore(owner.id);
  }

  const buyer = await orchestrator.createUser();
  await library.acquireGame(
    buyer.id,
    game.slug,
    store ? store.slug : undefined,
  );

  return { game, store };
}

async function createAdminSession() {
  const admin = await orchestrator.createAdminUser();
  return await orchestrator.createSession(admin.id);
}

describe("GET /api/v1/backoffice/revenue", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await getRevenue();

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: read:platform_ledger:any",
        status_code: 403,
      });
    });
  });

  describe("Activated user", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await getRevenue(session.token);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ForbiddenError");
    });
  });

  describe("Admin", () => {
    test("Should return an empty list when nothing has been sold", async () => {
      const session = await createAdminSession();

      const response = await getRevenue(session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ revenue: [] });
    });

    // The default terms: 70% supplier cost, no outlet, so the platform keeps
    // the rest. Every line is presented positive even though three of the four
    // accounts behind them are stored negative.
    test("Should report a global-storefront sale with no commission", async () => {
      await seedSale({ price: 100 });

      const session = await createAdminSession();

      const response = await getRevenue(session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.revenue).toEqual([
        {
          currency: "USD",
          gross: "100.0000",
          supplier_cost: "70.0000",
          affiliate_commission: "0.0000",
          platform_revenue: "30.0000",
          payouts: "0.0000",
        },
      ]);
    });

    // Commission is owned by an outlet, so a query filtered on a null owner
    // would drop this line entirely and leave the columns not adding up.
    test("Should include commission owed to an outlet", async () => {
      await seedSale({ price: 100, withOutlet: true });

      const session = await createAdminSession();

      const response = await getRevenue(session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.revenue).toEqual([
        {
          currency: "USD",
          gross: "100.0000",
          supplier_cost: "70.0000",
          affiliate_commission: "10.0000",
          platform_revenue: "20.0000",
          payouts: "0.0000",
        },
      ]);
    });

    // The zero-sum rule, read back through the report: what came in equals
    // what it was distributed into, or the ledger lost money somewhere.
    test("Should produce lines that add back up to the gross", async () => {
      await seedSale({ price: 100, withOutlet: true });
      await seedSale({ price: 49.99 });

      const session = await createAdminSession();

      const response = await getRevenue(session.token);
      const responseBody = await response.json();

      const [totals] = responseBody.revenue;
      const distributed =
        Number(totals.supplier_cost) +
        Number(totals.affiliate_commission) +
        Number(totals.platform_revenue);

      expect(distributed).toBeCloseTo(Number(totals.gross), 4);
      expect(Number(totals.gross)).toBeCloseTo(149.99, 4);
    });

    // Currencies are never summed together: a BRL total and a USD total are
    // separate books that happen to share a report.
    test("Should return one row per currency", async () => {
      // The base currency works unregistered for pricing, but an exchange rate
      // needs both sides on the register.
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({
        base_currency: "USD",
        quote_currency: "BRL",
        rate: 5,
      });

      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });

      const firstBuyer = await orchestrator.createUser();
      await library.acquireGame(firstBuyer.id, game.slug, undefined, "USD");

      const secondBuyer = await orchestrator.createUser();
      await library.acquireGame(secondBuyer.id, game.slug, undefined, "BRL");

      const session = await createAdminSession();

      const response = await getRevenue(session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.revenue).toHaveLength(2);
      // Sorted by code, so the order is stable rather than whatever the group
      // by handed back.
      expect(responseBody.revenue.map((row) => row.currency)).toEqual([
        "BRL",
        "USD",
      ]);
      expect(responseBody.revenue[0].gross).toBe("500.0000");
      expect(responseBody.revenue[1].gross).toBe("100.0000");
    });

    test("Should exclude sales outside the requested range", async () => {
      await seedSale({ price: 100 });

      const session = await createAdminSession();

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const response = await getRevenue(
        session.token,
        `?from=${tomorrow.toISOString()}`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ revenue: [] });
    });

    test("Should include sales inside the requested range", async () => {
      await seedSale({ price: 100 });

      const session = await createAdminSession();

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const response = await getRevenue(
        session.token,
        `?from=${yesterday.toISOString()}&to=${tomorrow.toISOString()}`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.revenue).toHaveLength(1);
      expect(responseBody.revenue[0].gross).toBe("100.0000");
    });

    test("Should reject a range that ends before it starts", async () => {
      const session = await createAdminSession();

      const response = await getRevenue(
        session.token,
        "?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid query parameters");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });

    test("Should reject a bound that is not a date", async () => {
      const session = await createAdminSession();

      const response = await getRevenue(session.token, "?from=not-a-date");

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
