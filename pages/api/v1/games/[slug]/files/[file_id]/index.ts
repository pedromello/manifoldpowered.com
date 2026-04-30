import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import gameFile from "models/game_file";
import authorization from "models/authorization";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { z } from "zod";
import { NextApiRequest, NextApiResponse } from "next";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .delete(controller.canRequest("delete:game_file"), deleteHandler)
  .handler(controller.errorHandlers);

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const querySchema = z.object({
    slug: z.string().min(1).max(255),
    file_id: z.uuid(),
  });

  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the URL and try again",
      cause: queryParse.error,
    });
  }

  const { slug, file_id: fileId } = queryParse.data;

  const gameResource = await game.findOneBySlug(slug);

  if (!gameResource) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Check the URL and try again",
    });
  }

  if (!authorization.can(req.context.user, "delete:game_file", gameResource)) {
    throw new ForbiddenError({
      message: "You are not allowed to delete files for this game",
      action: "Make sure you are the owner of the game",
    });
  }

  const file = await gameFile.findById(fileId);

  if (file.game_id !== gameResource.id) {
    throw new NotFoundError({
      message: "File does not belong to this game",
      action: "Check the URL and try again",
    });
  }

  await gameFile.remove(fileId);

  return res.status(204).end();
}
