import type { NextApiRequest } from "next";
import { prisma } from "infra/database";
import pricing from "models/pricing";
import { selectionView } from "models/store_selection_view";

jest.mock("infra/database", () => ({
  prisma: { game: { findMany: jest.fn() } },
}));
jest.mock("models/store", () => ({
  __esModule: true,
  default: {
    findOneForStorefront: async () => ({
      id: "outlet-id",
      slug: "cozy",
      name: "Cozy",
      logo_url: null,
      game_editorials_snapshot: [],
      featured_games_snapshot: [],
    }),
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
    summary: async () => ({
      slug: "weekend",
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
jest.mock("models/store_game_editorial", () => ({}));

test("keeps ordered display-only games without a checkout price and excludes unpriceable ACTIVE games", async () => {
  jest.mocked(prisma.game.findMany).mockResolvedValue([
    { id: "priceable", slug: "priceable", status: "ACTIVE" },
    { id: "unpriceable", slug: "unpriceable", status: "ACTIVE" },
    { id: "display-only", slug: "display-only", status: "ONLY_DISPLAY" },
  ] as never);
  const req = {
    headers: { "x-vercel-ip-country": "BR" },
    query: { locale: "pt-BR" },
    context: { user: {} },
  } as unknown as NextApiRequest;
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
});
