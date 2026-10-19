import { Prisma } from "generated/prisma/client";
import type { NextApiRequest } from "next";
import { prisma } from "infra/database";
import pricing from "models/pricing";
import externalOffer from "models/external_offer";
import { promotionGameIds } from "models/store_promotions";

jest.mock("infra/database", () => ({
  prisma: {
    game: { findMany: jest.fn(), fields: { base_price: "base_price" } },
    gameExternalOffer: { fields: { original_amount: "original_amount" } },
  },
}));
jest.mock("models/pricing", () => ({
  __esModule: true,
  default: { BASE_CURRENCY: "USD", displayPricesFor: jest.fn() },
}));
jest.mock("models/external_offer", () => ({
  __esModule: true,
  default: { regionalOffers: jest.fn() },
}));
jest.mock("models/storefront_pricing", () => ({
  __esModule: true,
  default: { externalOfferMaxAgeMs: () => 86_400_000 },
}));

beforeEach(() => jest.clearAllMocks());

test("scopes candidates by curation and regional fallback before reading only bounded price projections", async () => {
  jest.mocked(prisma.game.findMany).mockResolvedValue([]);
  const curation = { tags: { hasSome: ["co-op"] } };
  await promotionGameIds(
    { headers: { "x-vercel-ip-country": "BR" } } as NextApiRequest,
    curation,
    "USD",
  );
  const query = jest.mocked(prisma.game.findMany).mock.calls[0][0]!;
  expect(query.where?.AND).toEqual(expect.arrayContaining([curation]));
  expect(JSON.stringify(query.where)).toContain('"currency":"BRL"');
  expect(query.take).toBe(256);
  expect(query.select).not.toHaveProperty("description");
  expect(query.select).not.toHaveProperty("media");
  expect(query.select).not.toHaveProperty("localizations");
  expect(externalOffer.regionalOffers).not.toHaveBeenCalled();
});

test("continues through bounded batches without pricing unrelated artwork or localizations", async () => {
  const rows = Array.from({ length: 257 }, (_, index) => ({
    id: `game-${String(index).padStart(4, "0")}`,
    status: "ACTIVE" as const,
    nintendo_nsuid: null,
    social_links: {},
    price: new Prisma.Decimal(10),
    base_price: new Prisma.Decimal(20),
  }));
  jest
    .mocked(prisma.game.findMany)
    .mockResolvedValueOnce(rows.slice(0, 256) as never)
    .mockResolvedValueOnce(rows.slice(256) as never);
  jest.mocked(pricing.displayPricesFor).mockImplementation(
    async (games) =>
      new Map(
        games.map(({ id }) => [
          id,
          {
            amount: "10.00",
            base_amount: "20.00",
            currency: "USD",
            symbol: "$",
          },
        ]),
      ),
  );
  jest.mocked(externalOffer.regionalOffers).mockResolvedValue(new Map());
  const ids = await promotionGameIds(
    { headers: {} } as NextApiRequest,
    {},
    "USD",
  );
  expect(ids).toEqual(rows.map(({ id }) => id));
  expect(prisma.game.findMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      take: 256,
      cursor: { id: rows[255].id },
      skip: 1,
    }),
  );
  expect(pricing.displayPricesFor).toHaveBeenCalledTimes(2);
});
