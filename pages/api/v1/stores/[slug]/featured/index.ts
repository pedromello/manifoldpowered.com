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
} from "models/store_featured_game";

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
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
    const context = await storefrontPricing.contextFor(
      currency,
      editorialResult.games,
    );

    return res.status(200).json({
      games: storefrontPricing.filterAndPrice(
        req.context.user,
        editorialResult.games,
        context,
      ),
      pagination: editorialResult.pagination,
      currency,
      mode: "EDITORIAL",
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
    games: storefrontPricing.filterAndPrice(req.context.user, games, context),
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
    result.data.game_slugs,
  );

  return res.status(200).json({
    mode: "EDITORIAL",
    game_slugs: selection.map((entry) => entry.game_slug),
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
