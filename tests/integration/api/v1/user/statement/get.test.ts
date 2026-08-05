import orchestrator from "tests/orchestrator";
import library from "models/library";

const BASE_URL = "http://localhost:3000/api/v1/user/statement";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function getAs(sessionToken: string) {
  return await fetch(BASE_URL, {
    headers: { Cookie: `session_id=${sessionToken}` },
  });
}

async function seedAffiliateWithSale({ price = 100 } = {}) {
  const developer = await orchestrator.createUser();
  const game = await orchestrator.createGame(developer.id, { price });

  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  const session = await orchestrator.createSession(owner.id);

  const buyer = await orchestrator.createUser();
  await library.acquireGame(buyer.id, game.slug, store.slug);

  return { owner, store, session, game };
}

describe("GET /api/v1/user/statement", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const response = await fetch(BASE_URL);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: read:statement",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  describe("Activated user", () => {
    test("should return an empty statement when nothing has been earned", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await getAs(session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        balances: [],
        hold_days: 30,
      });
    });

    // A commission inside its hold is owed but not yet payable, and the
    // statement has to say both things at once.
    test("should report a held commission as owed but not payable", async () => {
      const { session } = await seedAffiliateWithSale();

      const response = await getAs(session.token);
      const responseBody = await response.json();

      expect(responseBody.balances).toEqual([
        {
          currency: "USD",
          total: "10.0000",
          payable: "0.0000",
          held: "10.0000",
        },
      ]);
    });

    test("should report a matured commission as payable", async () => {
      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const store = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);
      const buyer = await orchestrator.createUser();

      await library.acquireGame(buyer.id, game.slug, store.slug);

      // Age the hold rather than waiting 30 days for it.
      const { prisma } = await import("infra/database");
      await prisma.ledgerEntry.updateMany({
        where: { account_type: "AFFILIATE_COMMISSION" },
        data: { matures_at: new Date(Date.now() - 1000) },
      });

      const response = await getAs(session.token);
      const responseBody = await response.json();

      expect(responseBody.balances).toEqual([
        {
          currency: "USD",
          total: "10.0000",
          payable: "10.0000",
          held: "0.0000",
        },
      ]);
    });

    // Balances are per currency and are never added together: they are separate
    // debts, settled on separate rails.
    test("should keep each currency as its own balance", async () => {
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({ rate: 5 });

      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const store = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const buyer = await orchestrator.createUser();
      const otherBuyer = await orchestrator.createUser();

      await library.acquireGame(buyer.id, game.slug, store.slug, "USD");
      await library.acquireGame(otherBuyer.id, game.slug, store.slug, "BRL");

      const response = await getAs(session.token);
      const responseBody = await response.json();

      expect(responseBody.balances).toEqual([
        {
          currency: "BRL",
          total: "50.0000",
          payable: "0.0000",
          held: "50.0000",
        },
        {
          currency: "USD",
          total: "10.0000",
          payable: "0.0000",
          held: "10.0000",
        },
      ]);
    });

    // The whole point of the endpoint: one affiliate provably cannot see
    // another's earnings. There is no id in the request to tamper with.
    test("should never show another affiliate's earnings", async () => {
      await seedAffiliateWithSale();

      const stranger = await orchestrator.createUser();
      await orchestrator.activateUser(stranger.id);
      const strangerSession = await orchestrator.createSession(stranger.id);

      const response = await getAs(strangerSession.token);
      const responseBody = await response.json();

      expect(responseBody.balances).toEqual([]);
    });

    // Sums the affiliate's commissions across every outlet they run, because a
    // payout pays the person, not the storefront.
    test("should combine earnings across the affiliate's outlets", async () => {
      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const firstStore = await orchestrator.createStore(owner.id);
      const secondStore = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const buyer = await orchestrator.createUser();
      const otherBuyer = await orchestrator.createUser();

      await library.acquireGame(buyer.id, game.slug, firstStore.slug);
      await library.acquireGame(otherBuyer.id, game.slug, secondStore.slug);

      const response = await getAs(session.token);
      const responseBody = await response.json();

      expect(responseBody.balances).toHaveLength(1);
      expect(responseBody.balances[0].total).toBe("20.0000");
    });

    // A clawback after payout carries a negative balance forward against
    // future earnings, and the statement must show that honestly.
    test("should show a negative balance after a clawback", async () => {
      const { session, owner } = await seedAffiliateWithSale();

      const { prisma } = await import("infra/database");
      const ledger = (await import("models/ledger")).default;
      const randomUUID = (await import("node:crypto")).randomUUID;

      // Settle the commission, as a payout run would.
      await ledger.record({
        source_type: "PAYOUT",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_id: owner.id,
            amount: 10,
            currency: "USD",
          },
          {
            account_type: "PAYOUT",
            owner_id: owner.id,
            amount: -10,
            currency: "USD",
          },
        ],
      });

      // Then the sale is charged back.
      const commission = await prisma.ledgerEntry.findFirstOrThrow({
        where: { account_type: "AFFILIATE_COMMISSION", source_type: "SALE" },
      });
      await ledger.reverse(commission.entry_group_id);

      const response = await getAs(session.token);
      const responseBody = await response.json();

      expect(responseBody.balances[0].total).toBe("-10.0000");
    });

    test("should not be reachable by a disabled user", async () => {
      const { owner, session } = await seedAffiliateWithSale();

      await orchestrator.disableUser(owner.id);

      const response = await getAs(session.token);

      expect(response.status).toBe(403);
    });
  });
});
