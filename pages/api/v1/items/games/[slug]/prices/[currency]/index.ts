import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import pricing, { gamePriceOverrideSchema } from "models/pricing";
import authorization from "models/authorization";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .put(controller.canRequest("update:game_price"), putHandler)
  .delete(controller.canRequest("update:game_price"), deleteHandler)
  .handler(controller.errorHandlers);

async function putHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, currency } = req.query;

  const result = gamePriceOverrideSchema.safeParse({
    currency,
    amount: req.body?.amount,
  });

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const gameToPrice = await authorizeGame(req, slug as string);

  // Upsert: setting a price for a currency that already has one replaces it,
  // so the caller does not have to know whether an override exists yet.
  const override = await pricing.setOverride(gameToPrice.id, result.data);

  const priceRow = {
    currency: override.currency,
    amount: override.amount.toFixed(2),
    source: "OVERRIDE" as const,
    exchange_rate: null,
    is_override: true,
  };

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "update:game_price",
    priceRow,
  );

  return res.status(200).json(secureOutputValues);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, currency } = req.query;

  const gameToPrice = await authorizeGame(req, slug as string);

  // Removing an override does not remove the price: the game falls back to
  // conversion from its USD base price, or becomes unavailable in this
  // currency if no rate exists.
  await pricing.removeOverride(gameToPrice.id, currency as string);

  return res.status(204).end();
}

async function authorizeGame(req: NextApiRequest, slug: string) {
  const foundGame = await game.findOneBySlugWithStudio(slug);

  if (!foundGame) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct or if the game is still available.",
    });
  }

  if (!authorization.can(req.context.user, "update:game_price", foundGame)) {
    throw new ForbiddenError({
      message: "You do not have permission to update this game's prices",
      action: "Verify if you are a member of the studio that owns this game",
    });
  }

  return foundGame;
}
