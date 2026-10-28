import type { NextApiRequest } from "next";
import type { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import storefrontPricing from "models/storefront_pricing";
import pricing from "models/pricing";
import externalOffer from "models/external_offer";
import region from "models/region";
import { resolveCatalogOffer } from "lib/catalog-offer";
import { purchaseModeForGame } from "lib/game-purchase-mode";

const batchSize = 256;
const supportedProviders = {
  provider: { in: ["STEAM", "NINTENDO", "PLAYSTATION"] },
};

// Match regionalOffers' currency/Nintendo BR/USD/other fallback order. An
// undiscounted or stale preferred offer must suppress a sale in another market.
function regionalSaleWhere(
  currency: string,
  freshSale: Prisma.GameExternalOfferWhereInput,
): Prisma.GameWhereInput {
  const earlier: Prisma.GameWhereInput[] = [];
  const branches: Prisma.GameWhereInput[] = [];
  for (const market of [
    { currency },
    { provider: "NINTENDO", country: "BR" },
    { currency: "USD" },
    {},
  ]) {
    const scope = { ...supportedProviders, ...market };
    branches.push({
      AND: [
        ...earlier,
        { external_offers: { some: { ...scope, ...freshSale } } },
      ],
    });
    earlier.push({ external_offers: { none: scope } });
  }
  return { OR: branches };
}

/** Resolve regional eligibility before pagination, never by filtering one page. */
export async function promotionGameIds(
  req: NextApiRequest,
  curation: Prisma.GameWhereInput,
  currency: string,
) {
  const now = Date.now();
  const maxAgeMs = storefrontPricing.externalOfferMaxAgeMs();
  const capturedAt = {
    gte: new Date(now - maxAgeMs),
    lte: new Date(now + 300_000),
  };
  const offerCurrency = region.currencyCodeForCountry(
    region.externalOfferCountryFromRequest(req),
  );
  const where: Prisma.GameWhereInput = {
    status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
    AND: [
      curation,
      {
        OR: [
          {
            status: "ACTIVE",
            nintendo_nsuid: null,
            playstation_product_id: null,
            base_price: { gt: 0 },
            price: { lt: prisma.game.fields.base_price },
          },
          regionalSaleWhere(offerCurrency, {
            discount_percent: { gt: 0, lte: 100 },
            captured_at: capturedAt,
            amount: {
              gte: 0,
              lt: prisma.gameExternalOffer.fields.original_amount,
            },
          }),
          // Old Steam imports can have only the denormalized offer columns.
          {
            status: "ONLY_DISPLAY",
            nintendo_nsuid: null,
            playstation_product_id: null,
            external_offers: { none: supportedProviders },
            steam_discount_percent: { gt: 0, lte: 100 },
            steam_price_captured_at: capturedAt,
          },
        ],
      },
    ],
  };
  const ids: string[] = [];
  let cursor: string | undefined;
  while (true) {
    // Never load descriptions, artwork or localizations for the entire sale
    // catalog. Only a bounded price projection is needed to count eligible IDs;
    // the search endpoint enriches its actual page afterwards.
    const candidates = await prisma.game.findMany({
      where,
      select: {
        id: true,
        status: true,
        nintendo_nsuid: true,
        playstation_product_id: true,
        social_links: true,
        price: true,
        base_price: true,
        steam_price: true,
        steam_original_price: true,
        steam_discount_percent: true,
        steam_price_currency: true,
        steam_price_captured_at: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!candidates.length) break;
    const platformGames = candidates.filter(
      (game) => purchaseModeForGame(game) === "PLATFORM",
    );
    const externalGames = candidates.filter((game) =>
      ["STEAM_ONLY", "NINTENDO_ONLY", "PLAYSTATION_ONLY"].includes(
        purchaseModeForGame(game),
      ),
    );
    const [displayPrices, offers] = await Promise.all([
      pricing.displayPricesFor(platformGames, currency),
      externalOffer.regionalOffers(
        externalGames.map(({ id }) => id),
        offerCurrency,
      ),
    ]);
    for (const game of candidates) {
      const mode = purchaseModeForGame(game);
      if (mode === "PLATFORM" && !displayPrices.has(game.id)) continue;
      const selected = offers.get(game.id);
      const offer = selected
        ? {
            amount: selected.amount?.toFixed(2) ?? null,
            original_amount: selected.original_amount?.toFixed(2) ?? null,
            discount_percent: selected.discount_percent,
            currency: selected.currency,
            captured_at: selected.captured_at.toISOString(),
            expires_at: selected.expires_at?.toISOString() ?? null,
          }
        : mode === "STEAM_ONLY"
          ? {
              amount: game.steam_price?.toFixed(2) ?? null,
              original_amount: game.steam_original_price?.toFixed(2) ?? null,
              discount_percent: game.steam_discount_percent,
              currency: game.steam_price_currency,
              captured_at: game.steam_price_captured_at?.toISOString() ?? null,
            }
          : null;
      if (
        resolveCatalogOffer(
          {
            purchase_mode: mode,
            price: game.price.toFixed(2),
            base_price: game.base_price?.toFixed(2) ?? null,
            display_price: displayPrices.get(game.id),
            external_offer: offer
              ? {
                  ...offer,
                  provider:
                    mode === "NINTENDO_ONLY"
                      ? "NINTENDO"
                      : mode === "PLAYSTATION_ONLY"
                        ? "PLAYSTATION"
                        : "STEAM",
                }
              : null,
          },
          { now, maxAgeMs },
        ).discount_percent !== null
      ) {
        ids.push(game.id);
      }
    }
    if (candidates.length < batchSize) break;
    cursor = candidates[candidates.length - 1].id;
  }
  return ids;
}
