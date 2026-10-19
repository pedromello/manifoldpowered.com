import type { NextApiRequest } from "next";
import { prisma } from "infra/database";
import store from "models/store";
import storeSelection from "models/store_selection";
import storefrontPricing from "models/storefront_pricing";
import { filterStorefrontEditorial } from "models/storefront_editorial";
import storeGameEditorial from "models/store_game_editorial";

export async function selectionView(
  req: NextApiRequest,
  outletSlug: string,
  selectionSlug: string,
  preview = false,
) {
  const outlet = await store.findOneForStorefront(outletSlug, {
    preview,
    user: req.context.user,
  });
  const row = await storeSelection.findDraft(outlet.id, selectionSlug);
  const content = preview
    ? storeSelection.snapshot(row)
    : await storeSelection.publicSnapshot(row);
  const curation = await store.getStorefrontCurationWhereClause(outlet);
  const { currency, gameIds } =
    await storefrontPricing.idConstraintForRequest(req);
  const games = await prisma.game.findMany({
    where: {
      id: { in: content.game_ids },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      AND: [
        curation,
        ...(gameIds
          ? [
              {
                OR: [
                  { status: "ONLY_DISPLAY" as const },
                  { status: "ACTIVE" as const, id: { in: gameIds } },
                ],
              },
            ]
          : []),
      ],
    },
  });
  const byId = new Map(games.map((game) => [game.id, game]));
  const ordered = content.game_ids.flatMap((id) =>
    byId.has(id) ? [byId.get(id)!] : [],
  );
  const context = await storefrontPricing.contextFor(currency, ordered, req);
  const priced = storefrontPricing.filterAndPrice(
    req.context.user,
    ordered,
    context,
  );
  const summary = await storeSelection.summary(
    row,
    outletSlug,
    content,
    preview,
  );
  const reviews = preview
    ? await storeGameEditorial.findDraftByStoreAndGameIds(
        outlet.id,
        ordered.map(({ id }) => id),
      )
    : outlet.game_editorials_snapshot;
  return {
    selection: {
      ...summary,
      ...(!preview
        ? { game_slugs: priced.map((game) => String(game.slug)) }
        : {}),
    },
    outlet: {
      id: outlet.id,
      slug: outlet.slug,
      name: outlet.name,
      logo_url: outlet.logo_url,
      brand_tokens: outlet.brand_tokens,
      theme_key: outlet.theme_key,
    },
    games: priced.map((game) => {
      const editorial = reviews.find((review) => review.game_id === game.id);
      const featured = outlet.featured_games_snapshot.find(
        (pick) => pick.game_id === game.id,
      );
      return {
        ...game,
        recommendation_reason:
          editorial?.headline ||
          editorial?.body ||
          featured?.recommendation_reason ||
          content.description,
        outlet_review: filterStorefrontEditorial(req.context.user, editorial),
      };
    }),
    currency,
  };
}

export type SelectionView = Awaited<ReturnType<typeof selectionView>>;
