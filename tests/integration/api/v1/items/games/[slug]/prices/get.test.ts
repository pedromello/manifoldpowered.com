import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function setupOwnedGame(priceInUsd = 10) {
  await orchestrator.clearDatabaseRows();
  await orchestrator.createCurrency({ code: "USD", symbol: "$" });
  await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const studio = await orchestrator.createStudio(owner.id);
  const game = await orchestrator.createGame(owner.id, {
    price: priceInUsd,
    studio_id: studio.id,
  });
  const session = await orchestrator.createSession(owner.id);

  return { owner, studio, game, session };
}

function pricesUrl(slug: string) {
  return `${webserver.getOrigin()}/api/v1/items/games/${slug}/prices`;
}

describe("GET /api/v1/items/games/[slug]/prices", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const { game } = await setupOwnedGame();

      const response = await fetch(pricesUrl(game.slug));

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: read:game_price",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user without studio membership", () => {
    test("Should return 403 Forbidden", async () => {
      const { game } = await setupOwnedGame();

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      await orchestrator.addFeaturesToUser(outsider.id, ["read:game_price"]);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${outsiderSession.token}` },
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to read this game's prices",
        name: "ForbiddenError",
        action: "Verify if you are a member of the studio that owns this game",
        status_code: 403,
      });
    });
  });

  describe("Studio owner", () => {
    test("Should return one row per enabled currency", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.base_currency).toBe("USD");

      const byCurrency = Object.fromEntries(
        responseBody.prices.map((row) => [row.currency, row]),
      );

      expect(byCurrency.USD).toEqual({
        currency: "USD",
        amount: "10.00",
        source: "BASE",
        exchange_rate: null,
        is_override: false,
      });
      expect(byCurrency.BRL).toEqual({
        currency: "BRL",
        amount: "55.00",
        source: "CONVERTED",
        exchange_rate: "5.50000000",
        is_override: false,
      });
    });

    test("Should report a null amount where the game is unavailable", async () => {
      const { game, session } = await setupOwnedGame(10);
      // No USD→BRL rate and no override: not purchasable in BRL.

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const brl = responseBody.prices.find((row) => row.currency === "BRL");

      expect(brl).toEqual({
        currency: "BRL",
        amount: null,
        source: null,
        exchange_rate: null,
        is_override: false,
      });
    });

    test("Should mark an overridden currency", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${session.token}` },
      });

      const responseBody = await response.json();
      const brl = responseBody.prices.find((row) => row.currency === "BRL");

      expect(brl).toEqual({
        currency: "BRL",
        amount: "49.90",
        source: "OVERRIDE",
        exchange_rate: null,
        is_override: true,
      });
    });

    test("Should omit disabled currencies", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.createCurrency({
        code: "JPY",
        symbol: "¥",
        enabled: false,
      });

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${session.token}` },
      });

      const responseBody = await response.json();
      expect(responseBody.prices.map((row) => row.currency).sort()).toEqual([
        "BRL",
        "USD",
      ]);
    });

    test("With an unknown slug should return 404", async () => {
      const { session } = await setupOwnedGame();

      const response = await fetch(pricesUrl("does-not-exist"), {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(404);
      expect((await response.json()).name).toBe("NotFoundError");
    });
  });

  describe("Studio member without the permission", () => {
    test("Should return 403 Forbidden", async () => {
      const { studio, game } = await setupOwnedGame();

      // Holds the feature globally so canRequest lets the request through,
      // but their studio membership does not grant price access — the
      // resource check is what has to stop them.
      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addFeaturesToUser(member.id, ["read:game_price"]);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "update:game",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${memberSession.token}` },
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to read this game's prices",
        name: "ForbiddenError",
        action: "Verify if you are a member of the studio that owns this game",
        status_code: 403,
      });
    });
  });

  describe("Studio member with the permission", () => {
    test("Should return 200 OK", async () => {
      const { studio, game } = await setupOwnedGame();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addFeaturesToUser(member.id, ["read:game_price"]);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "read:game_price",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await fetch(pricesUrl(game.slug), {
        headers: { Cookie: `session_id=${memberSession.token}` },
      });

      expect(response.status).toBe(200);
    });
  });
});
