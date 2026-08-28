import { prisma } from "infra/database";
import { TooManyRequestsError, UnsupportedContentError } from "infra/errors";
import type { SteamAppDetailsResult } from "infra/steam";
import steamImport from "models/steam_import";
import library from "models/library";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("Steam community import", () => {
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

    expect(gateway.fetchAppDetails).toHaveBeenCalledWith(steamAppId);
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
        fetchAppDetails: async () => ({
          success: true,
          data: {
            name: "Allowed Unclaimed Fixture",
            short_description: "Catalog-only fixture",
            price_overview: {
              currency: "BRL",
              initial: 5990,
              final: 5990,
            },
          },
        }),
      },
    });

    expect(result.game).toMatchObject({
      status: "ONLY_DISPLAY",
      studio_id: null,
      steam_app_id: steamAppId,
      steam_price_currency: "BRL",
    });
    expect(result.game.price.toFixed(2)).toBe("0.00");
    expect(result.game.steam_price?.toFixed(2)).toBe("59.90");
    expect(result.game.steam_price_captured_at).toBeInstanceOf(Date);
    await expect(
      library.acquireGame(user.id, result.game.slug),
    ).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 400,
    });
    expect(await prisma.libraryItem.count()).toBe(0);
    expect(await prisma.sale.count()).toBe(0);
  });
});
