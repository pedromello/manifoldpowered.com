import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import authorization from "models/authorization";
import { ForbiddenError, NotFoundError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .patch(controller.canRequest("update:game"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const foundGame = await game.findOnePublicBySlug(slug as string);

  if (!foundGame) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct or if the game is still available.",
    });
  }

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:public_game",
    foundGame,
  );

  return res.status(200).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const gameUpdateDto = req.body;

  const userTryingToUpdate = req.context.user;
  const gameToUpdate = await game.findOneBySlug(slug as string);

  if (!gameToUpdate) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct or if the game is still available.",
    });
  }

  if (!authorization.can(userTryingToUpdate, "update:game", gameToUpdate)) {
    throw new ForbiddenError({
      message: "You do not have permission to update this game",
      action: "Verify if you are the owner of this game",
    });
  }

  const updatedGame = await game.update(gameToUpdate.id, gameUpdateDto);

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "update:game",
    updatedGame,
  );

  return res.status(200).json(secureOutputValues);
}
