import type { NextApiRequest } from "next";
import type { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import storefrontPricing from "models/storefront_pricing";
import { catalogOffer, type CatalogPriceInput } from "lib/catalog-offer";

/** Resolve regional eligibility before pagination, never by filtering one page. */
export async function promotionGameIds(
  req: NextApiRequest,
  curation: Prisma.GameWhereInput,
  currency: string,
) {
  const offers = await prisma.gameExternalOffer.findMany({
    where: {
      discount_percent: { gt: 0, lte: 100 },
      captured_at: {
        gte: new Date(Date.now() - storefrontPricing.externalOfferMaxAgeMs()),
      },
    },
    select: { game_id: true },
    distinct: ["game_id"],
  });
  const candidates = await prisma.game.findMany({
    where: {
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      AND: [
        curation,
        {
          OR: [
            { id: { in: offers.map(({ game_id }) => game_id) } },
            {
              status: "ACTIVE",
              base_price: { gt: 0 },
              price: { lt: prisma.game.fields.base_price },
            },
          ],
        },
      ],
    },
  });
  const context = await storefrontPricing.contextFor(currency, candidates, req);
  return storefrontPricing
    .filterAndPrice(req.context.user, candidates, context)
    .filter(
      (game) =>
        catalogOffer(game as CatalogPriceInput).discount_percent !== null,
    )
    .map((game) => String(game.id));
}
