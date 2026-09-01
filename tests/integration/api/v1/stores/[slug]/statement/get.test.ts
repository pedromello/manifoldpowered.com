import orchestrator from "tests/orchestrator";
import library from "models/library";
import { prisma } from "infra/database";
import gameModel from "models/game";

const BASE_URL = "http://localhost:3000/api/v1/stores";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function getStatement(slug: string, sessionToken?: string) {
  return await fetch(`${BASE_URL}/${slug}/statement`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

async function seedOutletWithSale({ price = 100 } = {}) {
  const developer = await orchestrator.createUser();
  const game = await orchestrator.createGame(developer.id, { price });
  await gameModel.makePublic(game.id);

  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  const session = await orchestrator.createSession(owner.id);

  const buyer = await orchestrator.createUser();
  await library.acquireGame(buyer.id, game.slug, store.slug);

  return { owner, store, session, game };
}

describe("GET /api/v1/stores/[slug]/statement", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const { store } = await seedOutletWithSale();

      const response = await getStatement(store.slug);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: read:store_statement",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  describe("Outlet owner", () => {
    test("should return an empty statement when nothing has been earned", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const store = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await getStatement(store.slug, session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ balances: [], hold_days: 30 });
    });

    // A commission inside its hold is owed but not yet payable, and the
    // statement has to say both things at once.
    test("should report a held commission as owed but not payable", async () => {
      const { store, session } = await seedOutletWithSale();

      const response = await getStatement(store.slug, session.token);
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
      const { store, session } = await seedOutletWithSale();

      // Age the hold rather than waiting 30 days for it.
      await prisma.ledgerEntry.updateMany({
        where: { account_type: "AFFILIATE_COMMISSION" },
        data: { matures_at: new Date(Date.now() - 1000) },
      });

      const response = await getStatement(store.slug, session.token);
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

    // Balances are per currency and never added together: separate debts,
    // settled on separate rails.
    test("should keep each currency as its own balance", async () => {
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({ rate: 5 });

      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });
      await gameModel.makePublic(game.id);

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const store = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const buyer = await orchestrator.createUser();
      const otherBuyer = await orchestrator.createUser();

      await library.acquireGame(buyer.id, game.slug, store.slug, "USD");
      await library.acquireGame(otherBuyer.id, game.slug, store.slug, "BRL");

      const response = await getStatement(store.slug, session.token);
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

    // The behaviour this whole re-scoping exists to produce. Under the previous
    // user-scoped model both outlets reported the same combined 20.
    test("should report each of an owner's outlets separately", async () => {
      const developer = await orchestrator.createUser();
      const game = await orchestrator.createGame(developer.id, { price: 100 });
      await gameModel.makePublic(game.id);

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const firstStore = await orchestrator.createStore(owner.id);
      const secondStore = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const buyer = await orchestrator.createUser();
      const otherBuyer = await orchestrator.createUser();

      await library.acquireGame(buyer.id, game.slug, firstStore.slug);
      await library.acquireGame(otherBuyer.id, game.slug, secondStore.slug);

      const firstBody = await (
        await getStatement(firstStore.slug, session.token)
      ).json();
      const secondBody = await (
        await getStatement(secondStore.slug, session.token)
      ).json();

      expect(firstBody.balances[0].total).toBe("10.0000");
      expect(secondBody.balances[0].total).toBe("10.0000");
    });

    // A clawback after payout carries a negative balance forward against
    // future earnings, and the statement must show that honestly.
    test("should show a negative balance after a clawback", async () => {
      const { store, session } = await seedOutletWithSale();

      const ledger = (await import("models/ledger")).default;
      const randomUUID = (await import("node:crypto")).randomUUID;

      // Settle the commission, as a payout run would.
      await ledger.record({
        source_type: "PAYOUT",
        source_id: randomUUID(),
        entries: [
          {
            account_type: "AFFILIATE_COMMISSION",
            owner_type: "STORE",
            owner_id: store.id,
            amount: 10,
            currency: "USD",
          },
          {
            account_type: "PAYOUT",
            owner_type: "STORE",
            owner_id: store.id,
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

      const response = await getStatement(store.slug, session.token);
      const responseBody = await response.json();

      expect(responseBody.balances[0].total).toBe("-10.0000");
    });

    test("should not be reachable by a disabled user", async () => {
      const { owner, store, session } = await seedOutletWithSale();

      await orchestrator.disableUser(owner.id);

      const response = await getStatement(store.slug, session.token);

      expect(response.status).toBe(403);
    });
  });

  // Money belongs to the outlet now, so reading its books is a permission an
  // owner can delegate without handing over the outlet itself.
  describe("Outlet member", () => {
    test("should read the statement when granted the permission", async () => {
      const { store } = await seedOutletWithSale();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "read:store_statement",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await getStatement(store.slug, memberSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.balances[0].total).toBe("10.0000");
    });

    test("should be refused without that permission", async () => {
      const { store } = await seedOutletWithSale();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "update:store",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await getStatement(store.slug, memberSession.token);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to view this store's statement",
        action: "Verify if you are an administrator of this store",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  // The slug is caller-supplied, so this is the check that replaced 6c's
  // "no identifier in the request" property.
  describe("Unrelated user", () => {
    test("should be refused another outlet's statement", async () => {
      const { store } = await seedOutletWithSale();

      const stranger = await orchestrator.createUser();
      await orchestrator.activateUser(stranger.id);
      const strangerSession = await orchestrator.createSession(stranger.id);

      const response = await getStatement(store.slug, strangerSession.token);

      expect(response.status).toBe(403);
    });

    test("should return 404 for an outlet that does not exist", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await getStatement("no-such-outlet", session.token);

      expect(response.status).toBe(404);
    });
  });
});
