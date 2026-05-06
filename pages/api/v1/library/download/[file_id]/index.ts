import { createRouter } from "next-connect";
import controller from "infra/controller";
import gameFile from "models/game_file";
import library from "models/library";
import { ForbiddenError, ValidationError } from "infra/errors";
import { z } from "zod";
import storage from "infra/storage";
import { NextApiRequest, NextApiResponse } from "next";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:game_file"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const querySchema = z.object({
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

  const { file_id: fileId } = queryParse.data;

  const file = await gameFile.findById(fileId);

  // Verify if the user owns this game in their library
  const userOwnsGame = await library.hasItem(
    req.context.user.id!,
    file.game_id,
    "GAME",
  );

  if (!userOwnsGame) {
    throw new ForbiddenError({
      message: "You do not own this game",
      action: "Purchase the game to download its files",
    });
  }

  const downloadUrl = await storage.getDownloadUrl(file.file_url);

  return res.status(200).json({
    download_url: downloadUrl,
  });
}
