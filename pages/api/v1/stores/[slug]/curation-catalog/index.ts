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

  const { currency, gameIds } =
    await storefrontPricing.idConstraintForRequest(req);
  const catalogGames = await game.findAllForCuration(gameIds);
  const [pricingContext, state] = await Promise.all([
    storefrontPricing.contextFor(currency, catalogGames, req),
    storeCuration.getCurationManagementState(
      foundStore.id,
      catalogGames.map((catalogGame) => catalogGame.id),
    ),
  ]);
  const games = storefrontPricing.filterAndPrice(
    req.context.user,
    catalogGames,
    pricingContext,
  );
  const now = Date.now();
  const newReleaseCutoff = now - 90 * 24 * 60 * 60 * 1000;

  const decorated = games.map((catalogGame) => {
    const override = state.overrides_by_game_id.get(catalogGame.id);
    const featured = state.featured_by_game_id.get(catalogGame.id);
    return {
      ...catalogGame,
      in_outlet: state.visible_ids.has(catalogGame.id),
      visibility_source:
        override?.visibility === "SHOW"
          ? "ALWAYS_VISIBLE"
          : override?.visibility === "HIDE"
            ? "HIDDEN_MANUALLY"
            : "RULE_OR_CATALOG",
      is_editorial: Boolean(featured),
      recommendation_reason: featured?.recommendation_reason ?? null,
      editorial_position: featured?.position ?? null,
      sales_count: state.sales_by_game_id.get(catalogGame.id) ?? 0,
      is_new_release:
        new Date(catalogGame.launch_date).getTime() >= newReleaseCutoff,
    };
  });

  const facetsByKey = new Map<string, { tag: string; count: number }>();
  for (const catalogGame of decorated) {
    for (const tag of catalogGame.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      const current = facetsByKey.get(key);
      facetsByKey.set(key, {
        tag: current?.tag ?? tag,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  const totals = {
    all: decorated.length,
    in_outlet: decorated.filter((catalogGame) => catalogGame.in_outlet).length,
    outside_outlet: decorated.filter((catalogGame) => !catalogGame.in_outlet)
      .length,
    editorial: decorated.filter((catalogGame) => catalogGame.is_editorial)
      .length,
    new_releases: decorated.filter((catalogGame) => catalogGame.is_new_release)
      .length,
    best_sellers: decorated.filter((catalogGame) => catalogGame.sales_count > 0)
      .length,
  };

  const normalizedQuery = query.data.q?.toLowerCase();
  let filtered = decorated.filter((catalogGame) => {
    if (
      normalizedQuery &&
      ![
        catalogGame.title,
        catalogGame.description,
        catalogGame.developer_name,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    ) {
      return false;
    }
    if (query.data.tag && !(catalogGame.tags ?? []).includes(query.data.tag)) {
      return false;
    }

    switch (query.data.status) {
      case "IN_OUTLET":
        return catalogGame.in_outlet;
      case "OUTSIDE_OUTLET":
        return !catalogGame.in_outlet;
      case "EDITORIAL":
        return catalogGame.is_editorial;
      case "NEW_RELEASES":
        return catalogGame.is_new_release;
      case "BEST_SELLERS":
        return catalogGame.sales_count > 0;
      default:
        return true;
    }
  });

  filtered = filtered.sort((left, right) => {
    if (query.data.status === "NEW_RELEASES") {
      return (
        new Date(right.launch_date).getTime() -
        new Date(left.launch_date).getTime()
      );
    }
    if (query.data.status === "BEST_SELLERS") {
      return right.sales_count - left.sales_count;
    }
    return left.title.localeCompare(right.title);
  });

  const featuredIds = [...state.featured_by_game_id.keys()];
  const featuredOutsideCount = featuredIds.filter(
    (gameId) => !state.visible_ids.has(gameId),
  ).length;
  const readiness = {
    result_count: totals.in_outlet,
    minimum_count: 5,
    has_minimum_catalog: totals.in_outlet >= 5,
    featured_count: featuredIds.length,
    featured_outside_count: featuredOutsideCount,
    featured_inside: featuredIds.length > 0 && featuredOutsideCount === 0,
    ready:
      state.catalog_mode !== "UNDECIDED" &&
      totals.in_outlet >= 5 &&
      featuredIds.length > 0 &&
      featuredOutsideCount === 0,
  };
  const start = (query.data.page - 1) * query.data.limit;
  const pageGames = filtered.slice(start, start + query.data.limit);

  return res.status(200).json({
    games: pageGames,
    pagination: {
      page: query.data.page,
      limit: query.data.limit,
      total: filtered.length,
      pages: Math.ceil(filtered.length / query.data.limit),
    },
    currency,
    catalog_mode: state.catalog_mode,
    draft_revision: state.draft_revision,
    totals,
    facets: [...facetsByKey.values()].sort((left, right) =>
      right.count === left.count
        ? left.tag.localeCompare(right.tag)
        : right.count - left.count,
    ),
    readiness,
  });
}
