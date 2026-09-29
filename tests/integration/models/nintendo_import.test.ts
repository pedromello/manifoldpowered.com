import { prisma } from "infra/database";
import { parseNintendoProduct } from "infra/nintendo";
import {
  NotFoundError,
  ServiceError,
  TooManyRequestsError,
} from "infra/errors";
import { nintendoProductUrl, type NintendoCountry } from "lib/nintendo";
import nintendoImport from "models/nintendo_import";
import gameModel from "models/game";
import library from "models/library";
import gameFile from "models/game_file";
import gameRelease from "models/game_release";
import gameLocalization from "models/game_localization";
import storefrontPricing from "models/storefront_pricing";
import review from "models/review";
import orchestrator from "tests/orchestrator";
import { nintendoHtml } from "tests/fixtures/nintendo";

const url = nintendoProductUrl("test-knight-switch", "BR");
const gateway = {
  fetchProduct: async (_slug: string, country: NintendoCountry) =>
    parseNintendoProduct(
      nintendoHtml(country),
      nintendoProductUrl("test-knight-switch", country),
    ),
};

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test("imports both languages, returns requested BR prices and permits community reviews without ownership", async () => {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const result = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway,
  });
  expect(result.created).toBe(true);
  expect(result.game).toMatchObject({
    nintendo_nsuid: "70010000003208",
    status: "ONLY_DISPLAY",
    studio_id: null,
    steam_app_id: null,
  });
  expect(result.game.slug).toContain("switch-70010000003208");
  expect(result.game.media).toMatchObject({
    videos: [],
    screenshots: [expect.stringContaining("/screenshot")],
  });
  const english = await gameLocalization.forGames([result.game.id], "en");
  expect(
    gameLocalization.apply(result.game, english.get(result.game.id)).title,
  ).toBe("Test Knight");
  const context = await storefrontPricing.contextFor("BRL", [result.game]);
  const output = storefrontPricing.filterAndPrice(
    user,
    [result.game],
    context,
  )[0];
  expect(output).toMatchObject({
    claimable: false,
    price: null,
    display_price: null,
    purchase_mode: "NINTENDO_ONLY",
    external_offer: {
      provider: "NINTENDO",
      country: "BR",
      currency: "BRL",
      amount: "30.00",
      original_amount: "60.00",
      discount_percent: 50,
      url,
    },
  });
  await review.add(user.id, result.game.slug, "A good console game", true);
  expect(
    await prisma.review.count({ where: { game_id: result.game.id } }),
  ).toBe(1);
});

test("simultaneous imports create one game and preserve its identity on refresh", async () => {
  const user = await orchestrator.createUser();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      nintendoImport.importGame({ userId: user.id, eshopUrl: url, gateway }),
    ),
  );
  expect(
    new Set(results.map((result) => result.refresh.operation_id)).size,
  ).toBe(1);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  const original = results.find((result) => result.created)!.game!;
  const writtenReview = await prisma.review.create({
    data: {
      game_id: original.id,
      user_id: user.id,
      message: "My recommendation",
      recommended: true,
    },
  });
  await gameModel.setStatus(original.id, "INACTIVE");
  await prisma.nintendoRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  const refreshed = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway,
  });
  expect(refreshed.game).toMatchObject({
    id: original.id,
    slug: original.slug,
    status: "INACTIVE",
  });
  expect(
    await prisma.review.findUnique({ where: { id: writtenReview.id } }),
  ).not.toBeNull();
});

test("regional failures and missing prices preserve the last valid offer and capture time", async () => {
  const user = await orchestrator.createUser();
  const original = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway,
  });
  const oldOffer = await prisma.gameExternalOffer.findFirstOrThrow({
    where: { game_id: original.game.id, country: "BR" },
  });
  await prisma.nintendoRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway: {
      fetchProduct: async (_slug, country) => {
        if (country === "US")
          throw new ServiceError({ message: "Unavailable", action: "Retry" });
        return parseNintendoProduct(
          nintendoHtml("BR", { 'prices({"personalized":false})': null }),
          url,
        );
      },
    },
  });
  const current = await prisma.gameExternalOffer.findUniqueOrThrow({
    where: { id: oldOffer.id },
  });
  expect(current.amount?.equals(oldOffer.amount!)).toBe(true);
  expect(current.captured_at).toEqual(oldOffer.captured_at);
  await prisma.nintendoRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  await expect(
    nintendoImport.importGame({
      userId: user.id,
      eshopUrl: url,
      gateway: {
        fetchProduct: async () => {
          throw new ServiceError({ message: "Unavailable", action: "Retry" });
        },
      },
    }),
  ).rejects.toThrow(ServiceError);
  expect(await prisma.game.count()).toBe(1);
});

test("US-only games retain USD and regional identity; mismatched regional IDs never merge", async () => {
  const user = await orchestrator.createUser();
  const result = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway: {
      fetchProduct: async (slug, country) => {
        if (country === "BR")
          throw new NotFoundError({
            message: "Not found",
            action: "Check link",
          });
        return gateway.fetchProduct(slug, country);
      },
    },
  });
  const context = await storefrontPricing.contextFor("BRL", [result.game]);
  expect(
    storefrontPricing.filterAndPrice(user, [result.game], context)[0]
      .external_offer,
  ).toMatchObject({ country: "US", currency: "USD", amount: "15.00" });
  await prisma.nintendoRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: nintendoProductUrl("test-knight-switch", "US"),
    gateway: {
      fetchProduct: async (_slug, country) =>
        parseNintendoProduct(
          nintendoHtml(
            country,
            country === "BR" ? { nsuid: "70010000117998" } : {},
          ),
          nintendoProductUrl("test-knight-switch", country),
        ),
    },
  });
  expect(
    await prisma.gameExternalOffer.count({
      where: { game_id: result.game.id, country: "BR" },
    }),
  ).toBe(0);
});

test("rejects acquisition, library insertion, local activation and distribution", async () => {
  const user = await orchestrator.createUser();
  const { game } = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway,
  });
  await expect(library.acquireGame(user.id, game.slug)).rejects.toThrow();
  await expect(library.add(user.id, game.id)).rejects.toThrow();
  await expect(gameModel.makePublic(game.id)).rejects.toThrow();
  await expect(
    gameRelease.createDraft({ game_id: game.id, version: "1" }),
  ).rejects.toThrow();
  await expect(
    gameFile.create({
      game_id: game.id,
      platform: "WINDOWS",
      display_name: "File",
      file_url: "test",
      size_bytes: 1,
      version: "1",
    }),
  ).rejects.toThrow();
  // Even an incorrectly inserted entitlement does not authorize a download.
  await prisma.libraryItem.create({
    data: { user_id: user.id, item_id: game.id, item_type: "GAME" },
  });
  expect(await library.hasItem(user.id, game.id)).toBe(false);
  await expect(
    prisma.game.update({ where: { id: game.id }, data: { status: "ACTIVE" } }),
  ).rejects.toThrow();
});

test("the twenty-first lookup is blocked before reaching Nintendo", async () => {
  const user = await orchestrator.createUser();
  await prisma.nintendoImportAttempt.createMany({
    data: Array.from({ length: 20 }, () => ({
      user_id: user.id,
      url,
      outcome: "SUCCESS",
    })),
  });
  const fetchProduct = jest.fn(gateway.fetchProduct);
  await expect(
    nintendoImport.importGame({
      userId: user.id,
      eshopUrl: url,
      gateway: { fetchProduct },
    }),
  ).rejects.toThrow(TooManyRequestsError);
  expect(fetchProduct).not.toHaveBeenCalled();
});

test("unknown release dates and prices stay unknown, and US-only games remain searchable in Portuguese", async () => {
  const user = await orchestrator.createUser();
  const result = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway: {
      fetchProduct: async (_slug, country) => {
        if (country === "BR")
          throw new NotFoundError({
            message: "Not found",
            action: "Check link",
          });
        return parseNintendoProduct(
          nintendoHtml("US", {
            releaseDate: null,
            'prices({"personalized":false})': null,
          }),
          nintendoProductUrl("test-knight-switch", "US"),
        );
      },
    },
  });
  expect(result.game.launch_date).toBeNull();
  const context = await storefrontPricing.contextFor("BRL", [result.game]);
  expect(
    storefrontPricing.filterAndPrice(user, [result.game], context)[0],
  ).toMatchObject({
    price: null,
    external_offer: { amount: null, currency: "USD" },
  });
  const catalog = await gameModel.findAllPaginated({
    locale: "pt-BR",
    order: "title_asc",
    q: "Test Knight",
  });
  expect(catalog.games.map((game) => game.id)).toContain(result.game.id);
});
