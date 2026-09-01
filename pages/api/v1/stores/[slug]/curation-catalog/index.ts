import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import store from "models/store";
import storeCuration from "models/store_curation";
import storefrontPricing from "models/storefront_pricing";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  q: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(100).optional(),
  locale: z.enum(["en", "pt-BR"]).default("en"),
  order: z.enum(["TITLE_ASC", "NEWEST", "BEST_SELLING"]).default("TITLE_ASC"),
  status: z
    .enum([
      "ALL",
      "IN_OUTLET",
      "OUTSIDE_OUTLET",
      "EDITORIAL",
      "NEW_RELEASES",
      "BEST_SELLERS",
    ])
    .default("ALL"),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("update:store"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: query.error.issues,
    });
  }

  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this Outlet's catalog.",
      action: "Ask the Outlet owner for catalog access.",
    });
  }

  const { currency, gameIds, locale } =
    await storefrontPricing.idConstraintForRequest(req);
  const [state, curationWhere] = await Promise.all([
    storeCuration.getCurationManagementState(foundStore.id, []),
    storeCuration.getCurationWhereClause(foundStore.id),
  ]);
  const featuredIds = [...state.featured_by_game_id.keys()];
  const newReleaseCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const catalogPage = await game.findCurationCatalogPage({
    page: query.data.page,
    limit: query.data.limit,
    q: query.data.q,
    tag: query.data.tag,
    status: query.data.status,
    order:
      query.data.status === "BEST_SELLERS" && !("order" in req.query)
        ? "BEST_SELLING"
        : query.data.order,
    locale,
    curationWhere,
    featuredGameIds: featuredIds,
    priceableGameIds: gameIds,
    newReleaseCutoff,
  });
  const pricingContext = await storefrontPricing.contextFor(
    currency,
    catalogPage.games,
    req,
  );
  const games = storefrontPricing.filterAndPrice(
    req.context.user,
    catalogPage.games,
    pricingContext,
  );

  const decorated = games.map((catalogGame) => {
    const override = state.overrides_by_game_id.get(catalogGame.id);
    const featured = state.featured_by_game_id.get(catalogGame.id);
    return {
      ...catalogGame,
      in_outlet: catalogPage.visible_ids.has(catalogGame.id),
      visibility_source:
        override?.visibility === "SHOW"
          ? "ALWAYS_VISIBLE"
          : override?.visibility === "HIDE"
            ? "HIDDEN_MANUALLY"
            : "RULE_OR_CATALOG",
      is_editorial: Boolean(featured),
      recommendation_reason: featured?.recommendation_reason ?? null,
      editorial_position: featured?.position ?? null,
      sales_count: catalogPage.sales_by_game_id.get(catalogGame.id) ?? 0,
      is_new_release:
        new Date(catalogGame.launch_date).getTime() >=
        newReleaseCutoff.getTime(),
    };
  });
  const featuredOutsideCount = featuredIds.filter(
    (gameId) => !catalogPage.visible_featured_ids.has(gameId),
  ).length;
  const readiness = {
    result_count: catalogPage.totals.in_outlet,
    minimum_count: 5,
    has_minimum_catalog: catalogPage.totals.in_outlet >= 5,
    featured_count: featuredIds.length,
    featured_outside_count: featuredOutsideCount,
    featured_inside: featuredIds.length > 0 && featuredOutsideCount === 0,
    ready:
      state.catalog_mode !== "UNDECIDED" &&
      catalogPage.totals.in_outlet >= 5 &&
      featuredIds.length > 0 &&
      featuredOutsideCount === 0,
  };

  return res.status(200).json({
    games: decorated,
    pagination: catalogPage.pagination,
    currency,
    catalog_mode: state.catalog_mode,
    draft_revision: state.draft_revision,
    totals: catalogPage.totals,
    facets: catalogPage.facets,
    readiness,
  });
}
