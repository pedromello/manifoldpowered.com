import type { NextApiRequest } from "next";
import { prisma } from "infra/database";
import pricing from "models/pricing";
import store from "models/store";
import storeGameEditorial from "models/store_game_editorial";
import { selectionView } from "models/store_selection_view";

jest.mock("infra/database", () => ({
  prisma: { game: { findMany: jest.fn() } },
}));
jest.mock("models/store", () => ({
  __esModule: true,
  default: {
    findOneForStorefront: jest.fn(),
    getStorefrontCurationWhereClause: async () => ({
      tags: { hasSome: ["Co-op"] },
    }),
  },
}));
jest.mock("models/store_selection", () => ({
  __esModule: true,
  default: {
    findDraft: async () => ({ id: "selection-id" }),
    publicSnapshot: async () => ({
      description: "A regional selection.",
      game_ids: ["unpriceable", "display-only", "priceable"],
    }),
    snapshot: () => ({
      description: "A draft selection description.",
      game_ids: ["display-only", "priceable"],
    }),
    summary: async () => ({
      slug: "weekend",
      description: "A regional selection.",
      game_slugs: ["unpriceable", "display-only", "priceable"],
    }),
  },
}));
jest.mock("models/region", () => ({
  __esModule: true,
  default: {
    currencyForRequest: async () => "BRL",
    externalOfferCountryFromRequest: () => "BR",
    currencyCodeForCountry: () => "BRL",
  },
}));
jest.mock("models/pricing", () => ({
  __esModule: true,
  default: {
    priceableGameIdConstraint: jest.fn().mockResolvedValue(["priceable"]),
    displayPricesFor: jest
      .fn()
      .mockResolvedValue(
        new Map([
          [
            "priceable",
            { amount: "19.90", currency: "BRL", source: "OVERRIDE" },
          ],
        ]),
      ),
  },
}));
jest.mock("models/external_offer", () => ({
  __esModule: true,
  default: { regionalOffers: async () => new Map() },
}));
jest.mock("models/game_localization", () => ({
  __esModule: true,
  default: {
    localeForRequest: () => "pt-BR",
    forGames: async () => new Map(),
    apply: (game: unknown) => game,
  },
}));
jest.mock("models/authorization", () => ({
  __esModule: true,
  default: {
    filterOutput: (_user: unknown, _feature: string, game: unknown) => game,
  },
}));
function outletFixture() {
  return {
    id: "outlet-id",
    slug: "cozy",
    name: "Cozy",
    logo_url: null,
    brand_tokens: { palette: "crimson", typography: "modern", shape: "soft" },
    theme_key: null,
    game_editorials_snapshot: [],
    featured_games_snapshot: [],
  };
}

const req = {
  headers: { "x-vercel-ip-country": "BR" },
  query: { locale: "pt-BR" },
  context: { user: {} },
} as unknown as NextApiRequest;

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(store.findOneForStorefront)
    .mockResolvedValue(outletFixture() as never);
  jest.mocked(prisma.game.findMany).mockResolvedValue([
    { id: "priceable", slug: "priceable", status: "ACTIVE" },
    { id: "unpriceable", slug: "unpriceable", status: "ACTIVE" },
    { id: "display-only", slug: "display-only", status: "ONLY_DISPLAY" },
  ] as never);
});
afterEach(() => jest.restoreAllMocks());

test("keeps ordered display-only games without a checkout price and excludes unpriceable ACTIVE games", async () => {
  const result = await selectionView(req, "cozy", "weekend");
  expect(pricing.priceableGameIdConstraint).toHaveBeenCalledWith("BRL");
  expect(prisma.game.findMany).toHaveBeenCalledWith({
    where: {
      id: { in: ["unpriceable", "display-only", "priceable"] },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      AND: [
        { tags: { hasSome: ["Co-op"] } },
        {
          OR: [
            { status: "ONLY_DISPLAY" },
            { status: "ACTIVE", id: { in: ["priceable"] } },
          ],
        },
      ],
    },
  });
  // Deliberately return an unpriceable row from the database mock as well:
  // the real shared storefront pricing projection must still drop it.
  expect(result.games.map((game) => game.slug)).toEqual([
    "display-only",
    "priceable",
  ]);
  expect(result.selection.game_slugs).toEqual(["display-only", "priceable"]);
  expect(result.games[0].display_price).toBeNull();
  expect(result.games[1].display_price).toMatchObject({ currency: "BRL" });
  expect(result.currency).toBe("BRL");
  expect(result.outlet).toMatchObject({
    brand_tokens: { palette: "crimson", typography: "modern", shape: "soft" },
    theme_key: null,
  });
});

test("keeps the selection description separate from game recommendations", async () => {
  const result = await selectionView(req, "cozy", "weekend");

  expect(result.selection.description).toBe("A regional selection.");
  expect(result.games).toHaveLength(2);
  for (const game of result.games) {
    expect(game.recommendation_reason).toBeNull();
    expect(game.outlet_review).toBeNull();
  }
});

test.each([
  {
    name: "a published review headline",
    headline: "A published game-specific headline",
    body: "The published review body.",
    expected: "A published game-specific headline",
  },
  {
    name: "the review body when its headline is blank",
    headline: "  ",
    body: "  A published game-specific opinion.  ",
    expected: "A published game-specific opinion.",
  },
  {
    name: "no recommendation for a rating-only review",
    headline: null,
    body: "",
    expected: null,
  },
  {
    name: "no recommendation for whitespace-only review text",
    headline: " \t ",
    body: "\r\n  ",
    expected: null,
  },
])("returns $name for the matching game only", async (example) => {
  const review = {
    game_id: "display-only",
    headline: example.headline,
    body: example.body,
    rating: { scale: "STARS", value: 0 },
  };
  jest.mocked(store.findOneForStorefront).mockResolvedValue({
    ...outletFixture(),
    game_editorials_snapshot: [review],
  } as never);

  const result = await selectionView(req, "cozy", "weekend");

  expect(result.games[0].recommendation_reason).toBe(example.expected);
  expect(result.games[0].outlet_review).toEqual({
    headline: review.headline,
    body: review.body,
    rating: review.rating,
  });
  expect(result.games[1].recommendation_reason).toBeNull();
  expect(result.games[1].outlet_review).toBeNull();
});

test.each([
  {
    reason: "A legacy recommendation for this game.",
    expected: "A legacy recommendation for this game.",
  },
  { reason: "  ", expected: null },
])(
  "preserves game-specific legacy copy without inventing a review: $reason",
  async ({ reason, expected }) => {
    jest.mocked(store.findOneForStorefront).mockResolvedValue({
      ...outletFixture(),
      featured_games_snapshot: [
        { game_id: "display-only", recommendation_reason: reason },
      ],
    } as never);

    const result = await selectionView(req, "cozy", "weekend");

    expect(result.games[0].recommendation_reason).toBe(expected);
    expect(result.games[0].outlet_review).toBeNull();
    expect(result.games[1].recommendation_reason).toBeNull();
  },
);

test("public selections use published reviews while preview uses the matching draft review", async () => {
  const published = {
    game_id: "display-only",
    headline: "The published opinion",
    body: "Published review text.",
    rating: null,
  };
  const draft = {
    ...published,
    headline: "An unpublished opinion",
    body: "Unpublished review text.",
  };
  jest.mocked(store.findOneForStorefront).mockResolvedValue({
    ...outletFixture(),
    game_editorials_snapshot: [published],
  } as never);
  const draftLookup = jest
    .spyOn(storeGameEditorial, "findDraftByStoreAndGameIds")
    .mockResolvedValue([draft]);

  const publicResult = await selectionView(req, "cozy", "weekend");
  expect(draftLookup).not.toHaveBeenCalled();
  expect(publicResult.games[0].outlet_review.headline).toBe(published.headline);
  expect(publicResult.games[0].recommendation_reason).toBe(published.headline);

  const previewResult = await selectionView(req, "cozy", "weekend", true);
  expect(draftLookup).toHaveBeenCalledWith("outlet-id", [
    "display-only",
    "priceable",
  ]);
  expect(previewResult.games[0].outlet_review.headline).toBe(draft.headline);
  expect(previewResult.games[0].recommendation_reason).toBe(draft.headline);
});
