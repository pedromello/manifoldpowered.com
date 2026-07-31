import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import pricing from "models/pricing";
import authorization from "models/authorization";
import { ForbiddenError, NotFoundError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:game_price"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const userTryingToRead = req.context.user;
  const foundGame = await game.findOneBySlugWithStudio(slug as string);

  if (!foundGame) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct or if the game is still available.",
    });
  }

  if (!authorization.can(userTryingToRead, "read:game_price", foundGame)) {
    throw new ForbiddenError({
      message: "You do not have permission to read this game's prices",
      action: "Verify if you are a member of the studio that owns this game",
    });
  }

  const priceView = await pricing.priceViewFor(foundGame);

  const secureOutputValues = priceView.map((priceRow) =>
    authorization.filterOutput(userTryingToRead, "read:game_price", priceRow),
  );

  return res.status(200).json({
    base_currency: pricing.BASE_CURRENCY,
    prices: secureOutputValues,
  });
}
