import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import game from "models/game";
import storeCuration from "models/store_curation";
import storefrontPricing from "models/storefront_pricing";
import { ForbiddenError, ValidationError } from "infra/errors";
import { z } from "zod";
import authorization from "models/authorization";
import storeFeaturedGame, {
  featuredGameSelectionSchema,
  MAX_FEATURED_GAMES,
} from "models/store_featured_game";

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce
    .number()
    .min(1)
    .max(MAX_FEATURED_GAMES)
    .default(MAX_FEATURED_GAMES),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .put(controller.canRequest("manage:store_featured_games"), putHandler)
  .delete(controller.canRequest("manage:store_featured_games"), deleteHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const result = listQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const foundStore = await store.findOneBySlug(slug as string);
  const curationWhere = await storeCuration.getCurationWhereClause(
    foundStore.id,
  );

  const { currency, gameIds } =
    await storefrontPricing.idConstraintForRequest(req);

  const editorialResult = await storeFeaturedGame.findAvailableEditorialGames({
    storeId: foundStore.id,
    curationWhere,
    priceableGameIds: gameIds,
    ...result.data,
  });

  if (editorialResult) {
    const editorialIds = new Set(
      editorialResult.games.map((editorialGame) => editorialGame.id),
    );
    const missingSlots = Math.max(
      0,
      MAX_FEATURED_GAMES - editorialResult.games.length,
    );
    let automaticGames: Awaited<
      ReturnType<typeof game.findAllPaginated>
    >["games"] = [];

    if (missingSlots > 0) {
      const automaticResult = await game.findAllPaginated({
        priceableGameIds: gameIds,
        page: 1,
        // Fetch enough candidates to discard any editorial games that also
        // rank naturally without leaving a hole in the three-slide carousel.
        limit: MAX_FEATURED_GAMES + editorialResult.games.length,
        order: "featured",
        curationWhere,
      });
      automaticGames = automaticResult.games
        .filter((automaticGame) => !editorialIds.has(automaticGame.id))
        .slice(0, missingSlots);
    }

    const combinedGames = [...editorialResult.games, ...automaticGames];
    const context = await storefrontPricing.contextFor(currency, combinedGames);
    const reasonByGameId = new Map(
      editorialResult.games.map((editorialGame) => [
        editorialGame.id,
        editorialGame.recommendation_reason,
      ]),
    );
    const pricedGames = storefrontPricing
      .filterAndPrice(req.context.user, combinedGames, context)
      .map((featuredGame) => ({
        ...featuredGame,
        featured_source: editorialIds.has(featuredGame.id)
          ? "EDITORIAL"
          : "AUTOMATIC",
        ...(editorialIds.has(featuredGame.id) && {
          recommendation_reason: reasonByGameId.get(featuredGame.id) ?? null,
        }),
      }));

    return res.status(200).json({
      games: pricedGames,
      pagination: {
        page: 1,
        limit: MAX_FEATURED_GAMES,
        total: pricedGames.length,
        pages: pricedGames.length > 0 ? 1 : 0,
      },
      currency,
      mode: automaticGames.length > 0 ? "HYBRID" : "EDITORIAL",
    });
  }

  const { games, pagination } = await game.findAllPaginated({
    priceableGameIds: gameIds,
    ...result.data,
    order: "featured",
    curationWhere,
  });

  const context = await storefrontPricing.contextFor(currency, games);

  return res.status(200).json({
    games: storefrontPricing
      .filterAndPrice(req.context.user, games, context)
      .map((featuredGame) => ({
        ...featuredGame,
        featured_source: "AUTOMATIC",
      })),
    pagination,
    currency,
    mode: "AUTOMATIC",
  });
}

async function putHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = featuredGameSelectionSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid.",
      action: "Choose between one and three unique game slugs.",
      context: result.error.issues,
    });
  }

  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (
    !authorization.can(
      req.context.user,
      "manage:store_featured_games",
      foundStore,
    )
  ) {
    throw new ForbiddenError({
      message:
        "You do not have permission to manage this Outlet's Featured games.",
      action:
        "Ask the Outlet owner for the manage:store_featured_games permission.",
    });
  }

  const selection = await storeFeaturedGame.replaceSelection(
    foundStore.id,
    result.data.recommendations,
  );

  return res.status(200).json({
    mode: "EDITORIAL",
    game_slugs: selection.map((entry) => entry.game_slug),
    recommendations: selection.map(({ game_slug, recommendation_reason }) => ({
      game_slug,
      recommendation_reason,
    })),
  });
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (
    !authorization.can(
      req.context.user,
      "manage:store_featured_games",
      foundStore,
    )
  ) {
    throw new ForbiddenError({
      message:
        "You do not have permission to manage this Outlet's Featured games.",
      action:
        "Ask the Outlet owner for the manage:store_featured_games permission.",
    });
  }

  await storeFeaturedGame.resetSelection(foundStore.id);
  return res.status(204).end();
}
