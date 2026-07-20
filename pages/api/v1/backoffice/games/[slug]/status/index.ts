import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game, { gameStatusUpdateSchema } from "models/game";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { NotFoundError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("update:game:status:any"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = gameStatusUpdateSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid status update payload",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { slug } = req.query;
  const existingGame = await game.findOneBySlug(slug as string);

  if (!existingGame) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct or if the game is still available.",
    });
  }

  const updatedGame = await game.setStatus(existingGame.id, result.data.status);

  await auditLog.record({
    admin_user_id: req.context.user.id as string,
    action: "game:status:update",
    target_type: "game",
    target_id: existingGame.id,
    reason: result.data.reason,
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "update:game:status:any",
    updatedGame,
  );

  return res.status(200).json(secureOutputValues);
}
