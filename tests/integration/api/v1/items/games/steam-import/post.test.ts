import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import steamImport from "models/steam_import";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/items/games/steam-import", () => {
  describe("Activated user", () => {
    test("Should return an imported game idempotently as visible and unclaimed", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const steamAppId = "900000010";
      const seededImport = await steamImport.importGame({
        userId: user.id,
        steamAppId,
        gateway: {
          fetchAppDetails: async () => ({
            success: true,
            data: {
              name: "Community Catalog Fixture",
              short_description: "A deterministic Steam import fixture",
              price_overview: {
                currency: "USD",
                initial: 2999,
                final: 1999,
                discount_percent: 33,
              },
            },
          }),
        },
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ steam_app_id: steamAppId }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody).toMatchObject({
        status: "ONLY_DISPLAY",
        id: seededImport.game.id,
        steam_app_id: steamAppId,
        studio_id: null,
        ownership_status: "UNCLAIMED",
        purchase_mode: "STEAM_ONLY",
        price: null,
        base_price: null,
        external_offer: {
          provider: "STEAM",
          amount: "19.99",
          original_amount: "29.99",
          discount_percent: 33,
          currency: "USD",
          url: `https://store.steampowered.com/app/${steamAppId}/`,
          captured_at: expect.any(String),
        },
      });
      expect(responseBody.social_links.steam_page).toBe(
        `https://store.steampowered.com/app/${steamAppId}/`,
      );

      const persistedGame = await orchestrator.getGameBySlug(responseBody.slug);
      expect(persistedGame).toMatchObject({
        status: "ONLY_DISPLAY",
        steam_app_id: steamAppId,
        studio_id: null,
        steam_price_currency: "USD",
        steam_discount_percent: 33,
      });
      expect(persistedGame.price.toFixed(2)).toBe("0.00");
      expect(persistedGame.steam_price?.toFixed(2)).toBe("19.99");
      expect(persistedGame.steam_original_price?.toFixed(2)).toBe("29.99");

      const catalogResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games?q=${encodeURIComponent(responseBody.title)}`,
      );
      expect(catalogResponse.status).toBe(200);
      const catalogBody = await catalogResponse.json();
      expect(catalogBody.games).toContainEqual(
        expect.objectContaining({
          id: responseBody.id,
          status: "ONLY_DISPLAY",
          display_price: null,
          purchase_mode: "STEAM_ONLY",
          external_offer: {
            provider: "STEAM",
            amount: "19.99",
            original_amount: "29.99",
            discount_percent: 33,
            currency: "USD",
            url: `https://store.steampowered.com/app/${steamAppId}/`,
            captured_at: expect.any(String),
          },
        }),
      );

      const reimportResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ steam_app_id: steamAppId }),
        },
      );

      expect(reimportResponse.status).toBe(200);
      expect(await reimportResponse.json()).toMatchObject({
        id: responseBody.id,
        slug: responseBody.slug,
        status: "ONLY_DISPLAY",
        ownership_status: "UNCLAIMED",
      });
    });

    test("With an invalid steam_app_id format should return 400", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ steam_app_id: "not-a-number" }),
        },
      );

      expect(response.status).toBe(400);
      expect((await response.json()).name).toBe("ValidationError");
    });
  });

  describe("Anonymous user", () => {
    test("Should return 403", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steam_app_id: "900000011" }),
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: import:steam_game",
        status_code: 403,
      });
    });
  });
});
