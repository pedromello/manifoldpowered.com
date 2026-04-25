import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game, { GameCreateDto, gameSchema } from "models/game";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:game"), async (req, res) => {
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

    try {
      const createdGame = await game.create(gameData);
      return res.status(201).json(createdGame);
    } catch (error) {
      console.error("Error creating game:", error);
      throw error;
    }
  })
  .handler(controller.errorHandlers);
