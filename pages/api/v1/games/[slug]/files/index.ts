import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import gameFile from "models/game_file";
import library from "models/library";
import authorization from "models/authorization";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { gameFileSchema } from "models/game_file";
import { z } from "zod";
import { NextApiRequest, NextApiResponse } from "next";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:game_file"), getHandler)
  .post(controller.canRequest("create:game_file"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const querySchema = z.object({
    slug: z.string().min(1).max(255),
  });

  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the URL and try again",
      cause: queryParse.error,
    });
  }

  const { slug } = queryParse.data;
  const gameResource = await game.findOneBySlug(slug);

  if (!gameResource) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Check the URL and try again",
    });
  }

  const hasGameOwnership = req.context.user.id === gameResource.user_id;
  const hasLibraryItem = await library.hasItem(
    req.context.user.id,
    gameResource.id,
  );

  if (!hasGameOwnership && !hasLibraryItem) {
    throw new ForbiddenError({
      message: "You do not have access to these files",
      action: "Acquire the game to access its files",
    });
  }

  const files = await gameFile.findAllByGameId(gameResource.id);

  const safeFiles = files.map((file) =>
    authorization.filterOutput(req.context.user, "read:game_file", file),
  );

  return res.status(200).json(safeFiles);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const querySchema = z.object({
    slug: z.string().min(1).max(255),
  });

  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the URL and try again",
      cause: queryParse.error,
    });
  }

  const { slug } = queryParse.data;
  const gameResource = await game.findOneBySlug(slug);

  if (!gameResource) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Check the URL and try again",
    });
  }

  if (!authorization.can(req.context.user, "create:game_file", gameResource)) {
    throw new ForbiddenError({
      message: "You are not allowed to upload files for this game",
      action: "Make sure you are the owner of the game",
    });
  }

  const parseResult = gameFileSchema
    .omit({ game_id: true })
    .safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError({
      message: "Invalid request payload",
      action: "Check the payload and try again",
      cause: parseResult.error,
    });
  }

  const newFile = await gameFile.create({
    ...parseResult.data,
    game_id: gameResource.id,
  });

  const safeFile = authorization.filterOutput(
    req.context.user,
    "create:game_file",
    newFile,
  );

  return res.status(201).json(safeFile);
}
