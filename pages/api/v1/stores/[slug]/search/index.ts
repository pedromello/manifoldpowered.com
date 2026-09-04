import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import game, { gameQuerySchema } from "models/game";
import storefrontPricing from "models/storefront_pricing";
import { ValidationError } from "infra/errors";
import { prepareStorefrontPreview } from "lib/storefront-preview";
import storeGameEditorial from "models/store_game_editorial";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const preview = prepareStorefrontPreview(req, res);

  const result = gameQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { order, sort_by, ...rest } = result.data;

  const foundStore = await store.findOneForStorefront(slug as string, {
    preview,
    user: req.context.user,
  });
  const curationWhere =
    await store.getStorefrontCurationWhereClause(foundStore);

  const { currency, gameIds, locale } =
    await storefrontPricing.idConstraintForRequest(req);

  const { games, pagination } = await game.findAllPaginated({
    priceableGameIds: gameIds,
    locale,
    ...rest,
    order: sort_by ?? order ?? "newest",
    curationWhere,
  });

  const context = await storefrontPricing.contextFor(currency, games, req);
  const reviews = storeGameEditorial.mapForStorefront(
    foundStore.storefront_source === "REVISION"
      ? foundStore.game_editorials_snapshot.filter((review) =>
          games.some(({ id }) => id === review.game_id),
        )
      : await storeGameEditorial.findDraftByStoreAndGameIds(
          foundStore.id,
          games.map(({ id }) => id),
        ),
  );
  const pricedGames = storefrontPricing.filterAndPrice(
    req.context.user,
    games,
    context,
  );

  return res.status(200).json({
    games: pricedGames.map((catalogGame) => ({
      ...catalogGame,
      outlet_review: reviews.get(catalogGame.id)
        ? {
            headline: reviews.get(catalogGame.id)!.headline,
            body: reviews.get(catalogGame.id)!.body,
          }
        : null,
    })),
    pagination,
    currency,
  });
}
