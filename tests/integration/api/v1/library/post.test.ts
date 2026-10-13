import orchestrator from "tests/orchestrator";
import gameModel from "models/game";
import webserver from "infra/webserver";
import { version as uuidVersion } from "uuid";
import { prisma } from "infra/database";

const buyers: string[] = [],
  games: string[] = [],
  studios: string[] = [];
const originalCreateUser = orchestrator.createUser;
const originalCreateGame = orchestrator.createGame;
async function createTestUser() {
  const account = await originalCreateUser();
  buyers.push(account.id);
  return account;
}
async function createTestGame(
  userId: string,
  data: Record<string, unknown> = {},
) {
  const game = await originalCreateGame(userId, data);
  games.push(game.id);
  studios.push(game.studio_id);
  return game;
}

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  jest.spyOn(orchestrator, "createUser").mockImplementation(createTestUser);
  jest.spyOn(orchestrator, "createGame").mockImplementation(createTestGame);
});

afterAll(async () => {
  const sales = await prisma.sale.findMany({
    where: { user_id: { in: buyers } },
    select: { id: true },
  });
  await prisma.ledgerEntry.deleteMany({
    where: {
      source_type: "SALE",
      source_id: { in: sales.map((sale) => sale.id) },
    },
  });
  await prisma.sale.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.libraryItem.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.store.deleteMany({ where: { owner_id: { in: buyers } } });
  await prisma.gamePriceOverride.deleteMany({
    where: { game_id: { in: games } },
  });
  await prisma.game.deleteMany({ where: { id: { in: games } } });
  await prisma.studioMember.deleteMany({
    where: { studio_id: { in: studios } },
  });
  await prisma.studio.deleteMany({ where: { id: { in: studios } } });
  await prisma.session.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.userActivationToken.deleteMany({
    where: { user_id: { in: buyers } },
  });
  await prisma.user.deleteMany({ where: { id: { in: buyers } } });
  jest.restoreAllMocks();
  await prisma.$disconnect();
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
    test("Paid games require checkout and cannot create an acquisition or sale directly", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 25 });
      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const session = await orchestrator.createSession(buyer.id);
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug: game.slug }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ checkout_required: true });
      expect(
        await prisma.libraryItem.count({
          where: { user_id: buyer.id, item_id: game.id },
        }),
      ).toBe(0);
      expect(
        await prisma.sale.count({
          where: { user_id: buyer.id, game_id: game.id },
        }),
      ).toBe(0);
    });
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

    test("With a valid free game slug should return 201 Created", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 0 });

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

    test("With a free game should add it to a new user's library without ledger entries", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 0 });

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          Cookie: `session_id=${buyerSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      expect(response.status).toBe(201);

      const libraryItem = await prisma.libraryItem.findUnique({
        where: {
          user_id_item_id_item_type: {
            user_id: buyer.id,
            item_id: game.id,
            item_type: "GAME",
          },
        },
      });
      expect(libraryItem).not.toBeNull();

      const sale = await prisma.sale.findFirstOrThrow({
        where: { user_id: buyer.id, game_id: game.id },
      });
      expect(sale.price_at_sale.isZero()).toBe(true);
      expect(
        await prisma.ledgerEntry.count({
          where: { source_type: "SALE", source_id: sale.id },
        }),
      ).toBe(0);
    });

    test("Without store_slug should record a Sale with a null store_id", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 0 });

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

      const sales = await prisma.sale.findMany({
        where: { user_id: buyer.id, game_id: game.id },
      });
      expect(sales).toHaveLength(1);
      expect(sales[0].store_id).toBeNull();
      // Both are Prisma Decimal instances, so compare values not references.
      expect(sales[0].price_at_sale.equals(game.price)).toBe(true);
    });

    test("With a valid store_slug should record a Sale attributed to that store", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 0 });
      await gameModel.makePublic(game.id);

      const storeOwner = await orchestrator.createUser();
      await orchestrator.activateUser(storeOwner.id);
      const createdStore = await orchestrator.createStore(storeOwner.id);

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
          store_slug: createdStore.slug,
        }),
      });

      expect(response.status).toBe(201);

      const sales = await prisma.sale.findMany({
        where: { user_id: buyer.id, game_id: game.id },
      });
      expect(sales).toHaveLength(1);
      expect(sales[0].store_id).toBe(createdStore.id);
    });

    test("With an unknown store_slug should still return 201 and record a Sale with a null store_id", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 0 });

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
          store_slug: "does-not-exist-store",
        }),
      });

      expect(response.status).toBe(201);

      const sales = await prisma.sale.findMany({
        where: { user_id: buyer.id, game_id: game.id },
      });
      expect(sales).toHaveLength(1);
      expect(sales[0].store_id).toBeNull();
    });

    test("Re-acquiring an owned free game should record acquisitions while LibraryItem stays a single row", async () => {
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      const game = await orchestrator.createGame(creator.id, { price: 0 });

      const buyer = await orchestrator.createUser();
      await orchestrator.activateUser(buyer.id);
      const buyerSession = await orchestrator.createSession(buyer.id);

      for (let i = 0; i < 2; i++) {
        const response = await fetch(
          `${webserver.getOrigin()}/api/v1/library`,
          {
            method: "POST",
            headers: {
              Cookie: `session_id=${buyerSession.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ slug: game.slug }),
          },
        );
        expect(response.status).toBe(201);
      }

      const sales = await prisma.sale.findMany({
        where: { user_id: buyer.id, game_id: game.id },
      });
      expect(sales).toHaveLength(2);

      const libraryItems = await prisma.libraryItem.findMany({
        where: { user_id: buyer.id, item_id: game.id, item_type: "GAME" },
      });
      expect(libraryItems).toHaveLength(1);
    });
  });
});
