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

async function deletePrice(
  sessionToken: string | null,
  slug: string,
  currencyCode: string,
) {
  const headers: Record<string, string> = {};

  if (sessionToken) {
    headers.Cookie = `session_id=${sessionToken}`;
  }

  return await fetch(
    `${webserver.getOrigin()}/api/v1/items/games/${slug}/prices/${currencyCode}`,
    { method: "DELETE", headers },
  );
}

describe("DELETE /api/v1/items/games/[slug]/prices/[currency]", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const { game } = await setupOwnedGame();

      const response = await deletePrice(null, game.slug, "BRL");

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
    test("Should return 403 Forbidden and leave the price in place", async () => {
      const { game } = await setupOwnedGame();
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      await orchestrator.addFeaturesToUser(outsider.id, ["update:game_price"]);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await deletePrice(
        outsiderSession.token,
        game.slug,
        "BRL",
      );

      expect(response.status).toBe(403);
      expect(await pricing.listOverrides(game.id)).toHaveLength(1);
    });
  });

  describe("Studio owner", () => {
    test("Should return 204 and fall back to conversion", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const response = await deletePrice(session.token, game.slug, "BRL");

      expect(response.status).toBe(204);

      const resolved = await pricing.priceFor(game, "BRL");
      expect(resolved?.source).toBe("CONVERTED");
      expect(resolved?.amount.toFixed(2)).toBe("55.00");
    });

    test("Removing the only price makes the game unavailable in that currency", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      // No exchange rate exists, so nothing is left to fall back to.
      const response = await deletePrice(session.token, game.slug, "BRL");

      expect(response.status).toBe(204);
      expect(await pricing.priceFor(game, "BRL")).toBeNull();
    });

    test("Should accept a lowercase currency in the path", async () => {
      const { game, session } = await setupOwnedGame(10);
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const response = await deletePrice(session.token, game.slug, "brl");

      expect(response.status).toBe(204);
      expect(await pricing.listOverrides(game.id)).toHaveLength(0);
    });

    test("With no override to remove should return 404", async () => {
      const { game, session } = await setupOwnedGame(10);

      const response = await deletePrice(session.token, game.slug, "BRL");

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "No BRL price override exists for this game.",
        name: "NotFoundError",
        action: "Check the game and currency and try again.",
        status_code: 404,
      });
    });

    test("With an unknown slug should return 404", async () => {
      const { session } = await setupOwnedGame();

      const response = await deletePrice(
        session.token,
        "does-not-exist",
        "BRL",
      );

      expect(response.status).toBe(404);
      expect((await response.json()).name).toBe("NotFoundError");
    });
  });

  describe("Studio member without the permission", () => {
    test("Should return 403 Forbidden and leave the price in place", async () => {
      const { studio, game } = await setupOwnedGame();
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

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

      const response = await deletePrice(memberSession.token, game.slug, "BRL");

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to update this game's prices",
        name: "ForbiddenError",
        action: "Verify if you are a member of the studio that owns this game",
        status_code: 403,
      });

      expect(await pricing.listOverrides(game.id)).toHaveLength(1);
    });
  });

  describe("Studio member with the permission", () => {
    test("Should return 204 No Content", async () => {
      const { studio, game } = await setupOwnedGame();
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addFeaturesToUser(member.id, ["update:game_price"]);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "update:game_price",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await deletePrice(memberSession.token, game.slug, "BRL");

      expect(response.status).toBe(204);
    });
  });
});
