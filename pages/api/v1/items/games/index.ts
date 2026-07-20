import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game, { GameCreateDto, gameSchema } from "models/game";
import studio from "models/studio";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:game"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = gameSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToCreate = req.context.user;
  const gameData: GameCreateDto = result.data;

  const developerStudio = await studio.findOneByIdWithMembers(
    gameData.studio_id,
  );

  if (!authorization.can(userTryingToCreate, "create:game", developerStudio)) {
    throw new ForbiddenError({
      message: "You do not have permission to create games for this studio",
      action:
        "Verify if you are a member of this studio with game creation rights",
    });
  }

  if (gameData.publisher_id) {
    const publisherStudio = await studio.findOneByIdWithMembers(
      gameData.publisher_id,
    );

    if (
      !authorization.can(userTryingToCreate, "create:game", publisherStudio)
    ) {
      throw new ForbiddenError({
        message:
          "You do not have permission to attribute this game to the given publisher studio",
        action:
          "Verify if you are a member of the publisher studio with game creation rights",
      });
    }
  }

  const createdGame = await game.create(gameData);

  const secureOutputValues = authorization.filterOutput(
    userTryingToCreate,
    "create:game",
    createdGame,
  );

  return res.status(201).json(secureOutputValues);
}
