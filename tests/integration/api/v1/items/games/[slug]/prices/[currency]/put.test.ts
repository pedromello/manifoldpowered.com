import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import pricing from "models/pricing";

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

async function putPrice(
  sessionToken: string | null,
  slug: string,
  currencyCode: string,
  body: unknown,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (sessionToken) {
    headers.Cookie = `session_id=${sessionToken}`;
  }

  return await fetch(
    `${webserver.getOrigin()}/api/v1/items/games/${slug}/prices/${currencyCode}`,
    { method: "PUT", headers, body: JSON.stringify(body) },
  );
}

describe("PUT /api/v1/items/games/[slug]/prices/[currency]", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const { game } = await setupOwnedGame();

      const response = await putPrice(null, game.slug, "BRL", { amount: 49.9 });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: update:game_price",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user without studio membership", () => {
    test("Should return 403 Forbidden and not write a price", async () => {
      const { game } = await setupOwnedGame();

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      await orchestrator.addFeaturesToUser(outsider.id, ["update:game_price"]);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await putPrice(outsiderSession.token, game.slug, "BRL", {
        amount: 1,
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to update this game's prices",
        name: "ForbiddenError",
        action: "Verify if you are a member of the studio that owns this game",
        status_code: 403,
      });

      expect(await pricing.listOverrides(game.id)).toHaveLength(0);
    });
  });

  describe("Studio owner", () => {
    test("With a valid amount should return 200 and set the price", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await putPrice(session.token, game.slug, "BRL", {
        amount: 49.9,
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        currency: "BRL",
        amount: "49.90",
        source: "OVERRIDE",
        exchange_rate: null,
        is_override: true,
      });

      const resolved = await pricing.priceFor(game, "BRL");
      expect(resolved?.source).toBe("OVERRIDE");
      expect(resolved?.amount.toFixed(2)).toBe("49.90");
    });

    test("The override wins over an existing exchange rate", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });

      await putPrice(session.token, game.slug, "BRL", { amount: 49.9 });

      const resolved = await pricing.priceFor(game, "BRL");
      expect(resolved?.amount.toFixed(2)).toBe("49.90");
    });

    test("Should replace an existing override rather than duplicating it", async () => {
      const { game, session } = await setupOwnedGame(10);

      await putPrice(session.token, game.slug, "BRL", { amount: 49.9 });
      const response = await putPrice(session.token, game.slug, "BRL", {
        amount: 59.9,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).amount).toBe("59.90");

      const overrides = await pricing.listOverrides(game.id);
      expect(overrides).toHaveLength(1);
      expect(overrides[0].amount.toFixed(2)).toBe("59.90");
    });

    test("Should accept a lowercase currency in the path", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await putPrice(session.token, game.slug, "brl", {
        amount: 49.9,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).currency).toBe("BRL");
    });

    test("Should allow a price of zero", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await putPrice(session.token, game.slug, "BRL", {
        amount: 0,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).amount).toBe("0.00");
    });

    test("With an unregistered currency should return 400", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await putPrice(session.token, game.slug, "JPY", {
        amount: 1500,
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: 'The currency "JPY" is not registered or is disabled.',
        name: "ValidationError",
        action: "Register and enable the currency before pricing in it.",
        status_code: 400,
      });
    });

    test("With a negative amount should return 400", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await putPrice(session.token, game.slug, "BRL", {
        amount: -1,
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.status_code).toBe(400);
    });

    test("With a missing amount should return 400", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await putPrice(session.token, game.slug, "BRL", {});

      expect(response.status).toBe(400);
      expect((await response.json()).name).toBe("ValidationError");
    });

    test("With an unknown slug should return 404", async () => {
      const { session } = await setupOwnedGame();

      const response = await putPrice(session.token, "does-not-exist", "BRL", {
        amount: 10,
      });

      expect(response.status).toBe(404);
      expect((await response.json()).name).toBe("NotFoundError");
    });
  });

  describe("Studio member without the permission", () => {
    test("Should return 403 Forbidden and not write a price", async () => {
      const { studio, game } = await setupOwnedGame();

      // Holds the feature globally so canRequest lets the request through,
      // but their studio membership does not grant price control — the
      // resource check is what has to stop them.
      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addFeaturesToUser(member.id, ["update:game_price"]);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "update:game",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await putPrice(memberSession.token, game.slug, "BRL", {
        amount: 49.9,
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to update this game's prices",
        name: "ForbiddenError",
        action: "Verify if you are a member of the studio that owns this game",
        status_code: 403,
      });

      expect(await pricing.listOverrides(game.id)).toHaveLength(0);
    });
  });

  describe("Studio member with the permission", () => {
    test("Should return 200 OK", async () => {
      const { studio, game } = await setupOwnedGame();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addFeaturesToUser(member.id, ["update:game_price"]);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "update:game_price",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await putPrice(memberSession.token, game.slug, "BRL", {
        amount: 49.9,
      });

      expect(response.status).toBe(200);
    });
  });
});
