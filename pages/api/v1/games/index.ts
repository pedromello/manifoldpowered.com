import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game, { gameQuerySchema } from "models/game";
import storefrontPricing from "models/storefront_pricing";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = gameQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { order, sort_by, ...rest } = result.data;

  const { currency, gameIds } =
    await storefrontPricing.idConstraintForRequest(req);

  const { games, pagination } = await game.findAllPaginated({
    ...rest,
    order: sort_by ?? order ?? "newest",
    priceableGameIds: gameIds,
  });

  const context = await storefrontPricing.contextFor(currency, games);

  return res.status(200).json({
    games: storefrontPricing.filterAndPrice(req.context.user, games, context),
    pagination,
    currency,
  });
}
