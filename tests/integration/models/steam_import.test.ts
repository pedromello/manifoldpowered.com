import { prisma } from "infra/database";
import {
  ServiceError,
  TooManyRequestsError,
  UnsupportedContentError,
} from "infra/errors";
import type { SteamAppDetailsResult } from "infra/steam";
import gameModel, { mapSteamAppToGameData } from "models/game";
import externalOffer from "models/external_offer";
import steamImport from "models/steam_import";
import library from "models/library";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("Steam community import", () => {
  test.each([
    {
      developers: ["Studio A", "Studio B", "Studio A"],
      publishers: ["Publisher"],
      expected: "Studio A, Studio B",
    },
    {
      developers: undefined,
      publishers: ["Publisher Fallback"],
      expected: "Publisher Fallback",
    },
    {
      developers: undefined,
      publishers: undefined,
      expected: "Unknown developer",
    },
  ])(
    "Should map Steam authorship to $expected",
    ({ developers, publishers, expected }) => {
      expect(
        mapSteamAppToGameData(
          { name: "Authorship Fixture", developers, publishers },
          "900000000",
        ).developer_name,
      ).toBe(expected);
    },
  );

  test("Should reject a game classified as Adult Only Sexual Content without persisting it", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const steamAppId = "900000001";
    const sensitiveNotes = "Sensitive fixture text that must not be exposed";
    const adultOnlyResult: SteamAppDetailsResult = {
      success: true,
      data: {
        name: "Blocked Steam Fixture",
        content_descriptors: {
          ids: [1, 3, 5],
          notes: sensitiveNotes,
        },
      },
    };
    const gateway = {
      fetchAppDetails: jest.fn().mockResolvedValue(adultOnlyResult),
    };

    let caughtError: UnsupportedContentError | undefined;
    try {
      await steamImport.importGame({
        userId: user.id,
        steamAppId,
        gateway,
      });
    } catch (error) {
      caughtError = error as UnsupportedContentError;
    }

    expect(gateway.fetchAppDetails).toHaveBeenCalledTimes(2);
    expect(gateway.fetchAppDetails).toHaveBeenCalledWith(
      steamAppId,
      "us",
      "english",
    );
    expect(gateway.fetchAppDetails).toHaveBeenCalledWith(
      steamAppId,
      "br",
      "brazilian",
    );
    expect(caughtError).toBeInstanceOf(UnsupportedContentError);
    expect(caughtError?.toJSON()).toEqual({
      name: "UnsupportedContentError",
      message:
        "This Steam game cannot be imported because it is classified as Adult Only Sexual Content.",
      action: "Import a game that complies with the platform content policy.",
      status_code: 422,
    });
    expect(JSON.stringify(caughtError?.toJSON())).not.toContain(sensitiveNotes);

    expect(
      await prisma.game.count({ where: { steam_app_id: steamAppId } }),
    ).toBe(0);
    expect(
      await prisma.steamImportAttempt.findFirst({
        where: { user_id: user.id, steam_app_id: steamAppId },
      }),
    ).toMatchObject({
      outcome: "BLOCKED_ADULT",
      content_descriptor_ids: [1, 3, 5],
      content_descriptors_present: true,
    });
  });

  test.each([
    { ids: [1], label: "some nudity or sexual content" },
    { ids: [4], label: "frequent nudity or sexual content" },
    { ids: [5], label: "general mature content" },
    { ids: [], label: "an empty descriptor list" },
    { ids: [999], label: "an unknown descriptor" },
  ])("Should not classify $label as adult-only", ({ ids }) => {
    expect(
      steamImport.isAdultOnlySteamGame({
        success: true,
        data: {
          name: "Allowed classification fixture",
          content_descriptors: { ids },
        },
      }),
    ).toBe(false);
  });

  test("Should classify descriptor 3 as adult-only even without notes", () => {
    expect(
      steamImport.isAdultOnlySteamGame({
        success: true,
        data: {
          name: "Blocked classification fixture",
          content_descriptors: { ids: [3] },
        },
      }),
    ).toBe(true);
  });

  test("Should reject the twenty-first new lookup in a rolling hour", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    await prisma.steamImportAttempt.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        user_id: user.id,
        steam_app_id: String(910000000 + index),
        outcome: "NOT_FOUND" as const,
      })),
    });
    const gateway = {
      fetchAppDetails: jest.fn(),
    };

    await expect(
      steamImport.importGame({
        userId: user.id,
        steamAppId: "919999999",
        gateway,
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(gateway.fetchAppDetails).not.toHaveBeenCalled();
  });

  test("Should keep an allowed unclaimed import visible but unavailable for acquisition", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const steamAppId = "920000001";
    const result = await steamImport.importGame({
      userId: user.id,
      steamAppId,
      gateway: {
        fetchAppDetails: async (
          _appId: string,
          countryCode?: string,
          language?: string,
        ) => ({
          success: true,
          data: {
            name:
              language === "brazilian"
                ? "Jogo de Catálogo Permitido"
                : "Allowed Unclaimed Fixture",
            short_description:
              language === "brazilian"
                ? "Descrição curta em português"
                : "Catalog-only fixture",
            detailed_description:
              language === "brazilian"
                ? "Descrição longa em português"
                : "Long English description",
            developers: ["Crystal Dynamics", "Crystal Dynamics", "  "],
            publishers: ["Square Enix"],
            price_overview: {
              currency: countryCode === "br" ? "BRL" : "USD",
              initial: countryCode === "br" ? 5990 : 2999,
              final: countryCode === "br" ? 5990 : 1999,
              discount_percent: countryCode === "br" ? 0 : 33,
            },
          },
        }),
      },
    });

    expect(result.game).toMatchObject({
      status: "ONLY_DISPLAY",
      studio_id: null,
      steam_app_id: steamAppId,
      developer_name: "Crystal Dynamics",
      publisher_name: "Square Enix",
      steam_price_currency: "USD",
      steam_discount_percent: 33,
    });
    expect(result.game.price.toFixed(2)).toBe("0.00");
    expect(result.game.steam_price?.toFixed(2)).toBe("19.99");
    expect(result.game.steam_original_price?.toFixed(2)).toBe("29.99");
    expect(result.game.steam_price_captured_at).toBeInstanceOf(Date);
    expect(
      await prisma.gameLocalization.findUnique({
        where: { game_id_locale: { game_id: result.game.id, locale: "pt-BR" } },
      }),
    ).toMatchObject({
      title: "Jogo de Catálogo Permitido",
      description: "Descrição curta em português",
      detailed_description: "Descrição longa em português",
      source: "STEAM",
    });
    const offers = await prisma.gameExternalOffer.findMany({
      where: { game_id: result.game.id },
      orderBy: { country: "asc" },
    });
    expect(offers).toMatchObject([
      {
        provider: "STEAM",
        country: "BR",
        currency: "BRL",
        discount_percent: 0,
        url: `https://store.steampowered.com/app/${steamAppId}/`,
      },
      {
        provider: "STEAM",
        country: "US",
        currency: "USD",
        discount_percent: 33,
        url: `https://store.steampowered.com/app/${steamAppId}/`,
      },
    ]);
    expect(offers[0].amount?.toFixed(2)).toBe("59.90");
    expect(offers[0].original_amount?.toFixed(2)).toBe("59.90");
    expect(offers[1].amount?.toFixed(2)).toBe("19.99");
    expect(offers[1].original_amount?.toFixed(2)).toBe("29.99");
    expect(
      (await externalOffer.regionalSteamOffers([result.game.id], "EUR")).get(
        result.game.id,
      ),
    ).toMatchObject({ country: "US", currency: "USD" });
    await expect(
      library.acquireGame(user.id, result.game.slug),
    ).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 400,
    });
    expect(await prisma.libraryItem.count()).toBe(0);
    expect(await prisma.sale.count()).toBe(0);
  });

  test("Should refresh Steam metadata and regional offers without changing catalog identity", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const steamAppId = "920000002";
    const first = await steamImport.importGame({
      userId: user.id,
      steamAppId,
      gateway: {
        fetchAppDetails: async (_appId, countryCode, language) => ({
          success: true,
          data: {
            name:
              language === "brazilian"
                ? "Identidade Estável do Catálogo"
                : "Stable Catalog Identity",
            developers: ["Original Developer"],
            price_overview: {
              currency: countryCode === "br" ? "BRL" : "USD",
              initial: 1000,
              final: 1000,
            },
          },
        }),
      },
    });

    const refreshed = await steamImport.importGame({
      userId: user.id,
      steamAppId,
      gateway: {
        fetchAppDetails: async (_appId, countryCode, language) => ({
          success: true,
          data: {
            name:
              language === "brazilian"
                ? "Título Steam Atualizado"
                : "Changed Steam Title",
            short_description:
              language === "brazilian"
                ? "Resumo atualizado"
                : "Updated summary",
            detailed_description:
              language === "brazilian"
                ? "Descrição completa atualizada"
                : "Updated full description",
            developers: ["Updated Developer"],
            publishers: ["Updated Publisher"],
            price_overview: {
              currency: countryCode === "br" ? "BRL" : "USD",
              initial: countryCode === "br" ? 7990 : 3999,
              final: countryCode === "br" ? 6990 : 2999,
            },
          },
        }),
      },
    });

    expect(refreshed.created).toBe(false);
    expect(refreshed.game).toMatchObject({
      id: first.game.id,
      slug: first.game.slug,
      status: "ONLY_DISPLAY",
      studio_id: null,
      title: "Changed Steam Title",
      developer_name: "Updated Developer",
      publisher_name: "Updated Publisher",
      steam_price_currency: "USD",
      steam_discount_percent: 25,
    });
    expect(refreshed.game.steam_price?.toFixed(2)).toBe("29.99");
    expect(refreshed.game.steam_original_price?.toFixed(2)).toBe("39.99");
    expect(
      await prisma.gameLocalization.findUnique({
        where: { game_id_locale: { game_id: first.game.id, locale: "pt-BR" } },
      }),
    ).toMatchObject({
      title: "Título Steam Atualizado",
      description: "Resumo atualizado",
      detailed_description: "Descrição completa atualizada",
      source: "STEAM",
    });
    const offers = await prisma.gameExternalOffer.findMany({
      where: { game_id: first.game.id },
      orderBy: { country: "asc" },
    });
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ country: "BR", currency: "BRL" });
    expect(offers[0].amount?.toFixed(2)).toBe("69.90");
    expect(offers[1]).toMatchObject({ country: "US", currency: "USD" });
    expect(offers[1].amount?.toFixed(2)).toBe("29.99");

    const partialRefresh = await steamImport.importGame({
      userId: user.id,
      steamAppId,
      gateway: {
        fetchAppDetails: async (_appId, countryCode) => {
          if (countryCode === "br") throw new Error("regional timeout");
          return {
            success: true,
            data: {
              name: "Changed Steam Title",
              developers: ["Updated Developer"],
              price_overview: {
                currency: "USD",
                initial: 1999,
                final: 1499,
              },
            },
          };
        },
      },
    });
    expect(partialRefresh.game.steam_price?.toFixed(2)).toBe("14.99");
    const preservedBrlOffer = await prisma.gameExternalOffer.findUnique({
      where: {
        game_id_provider_country: {
          game_id: first.game.id,
          provider: "STEAM",
          country: "BR",
        },
      },
    });
    expect(preservedBrlOffer?.amount?.toFixed(2)).toBe("69.90");
    expect(
      await prisma.gameLocalization.findUnique({
        where: { game_id_locale: { game_id: first.game.id, locale: "pt-BR" } },
      }),
    ).toMatchObject({
      title: "Título Steam Atualizado",
      description: "Resumo atualizado",
      detailed_description: "Descrição completa atualizada",
      source: "STEAM",
    });
  });

  test("Should not refresh a Steam game after ownership was granted", async () => {
    const importer = await orchestrator.createUser();
    await orchestrator.activateUser(importer.id);
    const steamAppId = "920000099";
    const imported = await steamImport.importGame({
      userId: importer.id,
      steamAppId,
      gateway: {
        fetchAppDetails: async () => ({
          success: true,
          data: { name: "Claimed Steam Catalog Game" },
        }),
      },
    });
    const studio = await orchestrator.createStudio(importer.id);
    await prisma.game.update({
      where: { id: imported.game.id },
      data: { studio_id: studio.id },
    });

    let gatewayCalls = 0;
    const result = await steamImport.importGame({
      userId: importer.id,
      steamAppId,
      gateway: {
        fetchAppDetails: async () => {
          gatewayCalls += 1;
          return {
            success: true,
            data: { name: "Untrusted Community Overwrite" },
          };
        },
      },
    });

    expect(gatewayCalls).toBe(0);
    expect(result.created).toBe(false);
    expect(result.game).toMatchObject({
      id: imported.game.id,
      title: "Claimed Steam Catalog Game",
      studio_id: studio.id,
    });

    await expect(
      gameModel.refreshUnclaimedSteamGame(
        imported.game.id,
        mapSteamAppToGameData(
          { name: "Concurrent Community Overwrite" },
          steamAppId,
        ),
        [],
      ),
    ).rejects.toBeDefined();
    await expect(
      prisma.game.findUniqueOrThrow({ where: { id: imported.game.id } }),
    ).resolves.toMatchObject({ title: "Claimed Steam Catalog Game" });
  });

  test("Should report a service failure when no region returns usable data", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    await expect(
      steamImport.importGame({
        userId: user.id,
        steamAppId: "920000003",
        gateway: {
          fetchAppDetails: async (_appId, countryCode) => {
            if (countryCode === "br") throw new Error("regional timeout");
            return { success: false };
          },
        },
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  test("Should create an English fallback when Brazilian content is unavailable", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const imported = await steamImport.importGame({
      userId: user.id,
      steamAppId: "920000004",
      gateway: {
        fetchAppDetails: async (_appId, countryCode) => {
          if (countryCode === "br") throw new Error("regional timeout");
          return {
            success: true,
            data: {
              name: "English Fallback Title",
              short_description: "English fallback summary",
              detailed_description: "English fallback details",
            },
          };
        },
      },
    });

    expect(
      await prisma.gameLocalization.findUnique({
        where: {
          game_id_locale: { game_id: imported.game.id, locale: "pt-BR" },
        },
      }),
    ).toMatchObject({
      title: "English Fallback Title",
      description: "English fallback summary",
      detailed_description: "English fallback details",
      source: "FALLBACK",
    });
  });

  test("Should order the catalog by the localized Portuguese title", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const englishFirst = await orchestrator.createGame(user.id, {
      title: "Alpha English Localized Order",
    });
    const englishLast = await orchestrator.createGame(user.id, {
      title: "Zulu English Localized Order",
    });
    await prisma.game.updateMany({
      where: { id: { in: [englishFirst.id, englishLast.id] } },
      data: { status: "ONLY_DISPLAY" },
    });
    await prisma.gameLocalization.update({
      where: { game_id_locale: { game_id: englishFirst.id, locale: "pt-BR" } },
      data: { title: "Zulu Português" },
    });
    await prisma.gameLocalization.update({
      where: { game_id_locale: { game_id: englishLast.id, locale: "pt-BR" } },
      data: { title: "Alpha Português" },
    });

    const { games } = await gameModel.findAllPaginated({
      locale: "pt-BR",
      order: "title_asc",
      limit: 100,
    });
    const ids = games.map((game) => game.id);

    expect(ids.indexOf(englishLast.id)).toBeLessThan(
      ids.indexOf(englishFirst.id),
    );
  });
});
