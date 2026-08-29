import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import steamImport from "models/steam_import";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/items/games/steam-import", () => {
  describe("Activated user", () => {
    test("Should expose the regional Steam offer for an imported catalog game", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const steamAppId = "900000010";
      const seededImport = await steamImport.importGame({
        userId: user.id,
        steamAppId,
        gateway: {
          fetchAppDetails: async (_appId, countryCode, language) => ({
            success: true,
            data: {
              name:
                language === "brazilian"
                  ? "Jogo Comunitário de Catálogo"
                  : "Community Catalog Fixture",
              short_description:
                language === "brazilian"
                  ? "Resumo determinístico em português"
                  : "A deterministic Steam import fixture",
              detailed_description:
                language === "brazilian"
                  ? "Descrição detalhada em português"
                  : "Detailed English description",
              developers: ["Crystal Dynamics"],
              publishers: ["Square Enix"],
              price_overview: {
                currency: countryCode === "br" ? "BRL" : "USD",
                initial: countryCode === "br" ? 5990 : 2999,
                final: countryCode === "br" ? 4990 : 1999,
                discount_percent: countryCode === "br" ? 17 : 33,
              },
            },
          }),
        },
      });

      const persistedGame = await orchestrator.getGameBySlug(
        seededImport.game.slug,
      );
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

      const usdResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games?q=${encodeURIComponent(seededImport.game.title)}`,
        { headers: { "x-vercel-ip-country": "US" } },
      );
      expect(usdResponse.status).toBe(200);
      const usdBody = await usdResponse.json();
      expect(usdBody.games).toContainEqual(
        expect.objectContaining({
          id: seededImport.game.id,
          title: "Community Catalog Fixture",
          description: "A deterministic Steam import fixture",
          detailed_description: "Detailed English description",
          developer_name: "Crystal Dynamics",
          publisher_name: "Square Enix",
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

      const brlResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games?q=${encodeURIComponent("Jogo Comunitário")}&locale=pt-BR`,
        { headers: { "x-vercel-ip-country": "BR" } },
      );
      expect(brlResponse.status).toBe(200);
      const brlBody = await brlResponse.json();
      expect(brlBody.games).toContainEqual(
        expect.objectContaining({
          id: seededImport.game.id,
          title: "Jogo Comunitário de Catálogo",
          description: "Resumo determinístico em português",
          external_offer: expect.objectContaining({
            amount: "49.90",
            original_amount: "59.90",
            discount_percent: 17,
            currency: "BRL",
          }),
        }),
      );

      const detailResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${seededImport.game.slug}?locale=pt-BR`,
        {
          headers: {
            // Reproduces the second Vercel hop made by getServerSideProps:
            // Vercel recalculates its header as US, while the SSR-specific
            // header preserves the original Brazilian visitor.
            "x-vercel-ip-country": "US",
            "x-manifold-visitor-country": "BR",
          },
        },
      );
      expect(detailResponse.status).toBe(200);
      expect(await detailResponse.json()).toMatchObject({
        id: seededImport.game.id,
        title: "Jogo Comunitário de Catálogo",
        description: "Resumo determinístico em português",
        detailed_description: "Descrição detalhada em português",
        developer_name: "Crystal Dynamics",
        external_offer: {
          provider: "STEAM",
          amount: "49.90",
          original_amount: "59.90",
          discount_percent: 17,
          currency: "BRL",
          url: `https://store.steampowered.com/app/${steamAppId}/`,
          captured_at: expect.any(String),
        },
      });

      const portuguesePage = await fetch(
        `${webserver.getOrigin()}/pt-BR/item/${seededImport.game.slug}`,
      );
      expect(portuguesePage.status).toBe(200);
      const portugueseHtml = await portuguesePage.text();
      expect(portugueseHtml).toContain("Jogo Comunitário de Catálogo");
      expect(portugueseHtml).toContain("Descrição detalhada em português");
      expect(portugueseHtml).toContain(
        '<meta name="description" content="Resumo determinístico em português"',
      );
      expect(portugueseHtml).toContain(
        '<meta property="og:title" content="Jogo Comunitário de Catálogo',
      );
      expect(portugueseHtml).toContain('"name":"Jogo Comunitário de Catálogo"');

      const englishPage = await fetch(
        `${webserver.getOrigin()}/item/${seededImport.game.slug}`,
      );
      expect(englishPage.status).toBe(200);
      const englishHtml = await englishPage.text();
      expect(englishHtml).toContain("Community Catalog Fixture");
      expect(englishHtml).toContain("Detailed English description");
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
