import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import game, { gameQuerySchema } from "models/game";
import storeCuration from "models/store_curation";
import storefrontPricing from "models/storefront_pricing";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const preview = req.query.preview === "1";

  const result = gameQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { order, sort_by, ...rest } = result.data;

  const foundStore = await store.findOneVisibleBySlug(
    slug as string,
    req.context.user,
    preview,
  );
  const publishedRevision = store.curationRevisionForRequest(
    foundStore,
    preview,
  );
  if (preview) setPreviewHeaders(res);
  const curationWhere = await storeCuration.getCurationWhereClause(
    foundStore.id,
    publishedRevision,
  );

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

  return res.status(200).json({
    games: storefrontPricing.filterAndPrice(req.context.user, games, context),
    pagination,
    currency,
  });
}

function setPreviewHeaders(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}
