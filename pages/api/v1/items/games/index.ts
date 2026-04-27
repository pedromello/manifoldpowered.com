import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game, { GameCreateDto, gameSchema } from "models/game";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

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

  const gameData: GameCreateDto = {
    ...result.data,
    user_id: req.context.user.id,
  };

  const createdGame = await game.create(gameData);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "create:game",
    createdGame,
  );

  return res.status(201).json(secureOutputValues);
}
