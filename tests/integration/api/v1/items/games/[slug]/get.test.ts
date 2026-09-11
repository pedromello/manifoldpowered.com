import { parseNintendoProduct } from "infra/nintendo";
import { NotFoundError } from "infra/errors";
import { nintendoProductUrl, type NintendoCountry } from "lib/nintendo";
import nintendoImport from "models/nintendo_import";
import { nintendoHtml } from "tests/fixtures/nintendo";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/items/games/[slug]", () => {
  describe("Anonymous user", () => {
    test("With valid slug should return 200 and game data", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const game = await orchestrator.createGame(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
      );

      // Assert
      expect(response.status).toBe(200);
      const responseBody = await response.json();

      expect(responseBody.id).toBe(game.id);
      expect(responseBody.slug).toBe(game.slug);
      expect(responseBody.title).toBe(game.title);
      expect(responseBody.description).toBe(game.description);
      // The API serialises Decimal to a fixed 2-decimal string.
      expect(responseBody.price).toBe(game.price.toFixed(2));
    });

    test("With non-existent slug should return 404", async () => {
      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/non-existent-game`,
      );

      // Assert
      expect(response.status).toBe(404);
      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "NotFoundError",
        message: 'The game with slug "non-existent-game" was not found.',
        action:
          "Check if the slug is correct or if the game is still available.",
        status_code: 404,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With valid slug should return 200 and game data", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          headers: {
            Cookie: `session_id=${session.token}`,
          },
        },
      );

      // Assert
      expect(response.status).toBe(200);
      const responseBody = await response.json();

      expect(responseBody.id).toBe(game.id);
      expect(responseBody.slug).toBe(game.slug);
    });
  });
  describe("Regional pricing", () => {
    test("Should attach display_price in the visitor's currency", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id, { price: 10 });
      await gameModel.setStatus(game.id, "ACTIVE");

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        { headers: { "x-vercel-ip-country": "BR" } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.display_price).toEqual({
        amount: "55.00",
        base_amount: null,
        currency: "BRL",
        symbol: "R$",
      });
    });

    test("Should return 404 where the game has no price in that currency", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createCurrency({ code: "USD", symbol: "$" });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });
      // No rate and no override: not purchasable in BRL.

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id, { price: 10 });
      await gameModel.setStatus(game.id, "ACTIVE");

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        { headers: { "x-vercel-ip-country": "BR" } },
      );

      // The detail page has to agree with the listings that hide it.
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: `The game with slug "${game.slug}" is not available in BRL.`,
        name: "NotFoundError",
        action:
          "Check back later, or browse the games available in your region.",
        status_code: 404,
      });
    });
  });
  describe("Nintendo regional offers", () => {
    interface RegionalCase {
      scenario: string;
      locale: "en" | "pt-BR";
      headers: Record<string, string>;
      unavailable?: NintendoCountry;
      expectedCountry: NintendoCountry;
      expectedTitle: string;
    }

    const cases: RegionalCase[] = [
      {
        scenario: "US visitor reading Portuguese gets the US offer",
        locale: "pt-BR",
        headers: { "x-vercel-ip-country": "US" },
        expectedCountry: "US",
        expectedTitle: "Cavaleiro de Teste",
      },
      {
        scenario: "Brazilian visitor reading English gets the Brazilian offer",
        locale: "en",
        headers: { "x-vercel-ip-country": "BR" },
        expectedCountry: "BR",
        expectedTitle: "Test Knight",
      },
      {
        scenario:
          "SSR preserves the US visitor offer when the server is in Brazil",
        locale: "pt-BR",
        headers: {
          "x-manifold-visitor-country": "US",
          "x-vercel-ip-country": "BR",
        },
        expectedCountry: "US",
        expectedTitle: "Cavaleiro de Teste",
      },
      {
        scenario:
          "US visitor falls back to the Brazilian price and URL when US is unavailable",
        locale: "en",
        headers: { "x-vercel-ip-country": "US" },
        unavailable: "US",
        expectedCountry: "BR",
        expectedTitle: "Cavaleiro de Teste",
      },
      {
        scenario:
          "Brazilian visitor falls back to the US price and URL when Brazil is unavailable",
        locale: "pt-BR",
        headers: { "x-vercel-ip-country": "BR" },
        unavailable: "BR",
        expectedCountry: "US",
        expectedTitle: "Test Knight",
      },
      {
        scenario:
          "unmatched EUR currency preserves the Brazilian fallback without conversion",
        locale: "en",
        headers: { "x-vercel-ip-country": "FR" },
        expectedCountry: "BR",
        expectedTitle: "Test Knight",
      },
    ];

    beforeEach(async () => {
      await orchestrator.clearDatabaseRows();
    });

    test.each(cases)(
      "$scenario in game details and the catalog",
      async ({
        locale,
        headers,
        unavailable,
        expectedCountry,
        expectedTitle,
      }) => {
        const user = await orchestrator.createUser({
          username: "nintendo-offer-fixture",
          email: "nintendo-offer-fixture@example.test",
          password: null,
        });
        const { game } = await nintendoImport.importGame({
          userId: user.id,
          eshopUrl: nintendoProductUrl("test-knight-switch", "BR"),
          gateway: {
            fetchProduct: async (slug, country) => {
              if (country === unavailable)
                throw new NotFoundError({
                  message: "Fixture unavailable in this region.",
                  action: "Use another region.",
                });
              return parseNintendoProduct(
                nintendoHtml(country),
                nintendoProductUrl(slug, country),
              );
            },
          },
        });

        const origin = webserver.getOrigin();
        const [detailResponse, catalogResponse] = await Promise.all([
          fetch(`${origin}/api/v1/items/games/${game!.slug}?locale=${locale}`, {
            headers,
          }),
          fetch(`${origin}/api/v1/games?locale=${locale}`, { headers }),
        ]);
        expect(detailResponse.status).toBe(200);
        expect(catalogResponse.status).toBe(200);
        const detail = await detailResponse.json();
        const catalog = await catalogResponse.json();
        const expected = {
          id: game!.id,
          title: expectedTitle,
          claimable: false,
          purchase_mode: "NINTENDO_ONLY",
          price: null,
          display_price: null,
          external_offer: {
            provider: "NINTENDO",
            country: expectedCountry,
            currency: expectedCountry === "BR" ? "BRL" : "USD",
            amount: expectedCountry === "BR" ? "30.00" : "15.00",
            original_amount: expectedCountry === "BR" ? "60.00" : "15.00",
            discount_percent: expectedCountry === "BR" ? 50 : null,
            url: nintendoProductUrl("test-knight-switch", expectedCountry),
            captured_at: expect.any(String),
          },
        };
        expect(detail).toMatchObject(expected);
        expect(catalog.games).toContainEqual(expect.objectContaining(expected));
      },
    );
  });
});
