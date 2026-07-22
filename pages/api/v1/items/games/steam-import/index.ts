import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import game, { GameCreateDto, gameSchema } from "models/game";
import studio from "models/studio";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

const steamImportRequestSchema = z.object({
  studio_id: z.uuid(),
  publisher_id: z.uuid().optional(),
  steam_app_id: z
    .string()
    .regex(/^[1-9]\d*$/, "steam_app_id must be a positive integer string"),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:game"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = steamImportRequestSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToImport = req.context.user;
  const { studio_id, publisher_id, steam_app_id } = result.data;

  // Steam data (description, images, price, ...) changes over time, so
  // re-importing an already-imported app refreshes it in place instead of
  // being rejected as a duplicate. Authorization for this path is checked
  // against the game's *actual* owning studio (via "update:game"), not the
  // studio_id in the request body — otherwise an unrelated studio could
  // hijack another studio's already-imported game just by re-submitting its
  // Steam app id under their own studio_id.
  const existingGame = await game.findOneBySteamAppIdWithStudio(steam_app_id);

  if (existingGame) {
    if (!authorization.can(userTryingToImport, "update:game", existingGame)) {
      throw new ForbiddenError({
        message: "You do not have permission to update this game",
        action: "Verify if you are the owner of this game",
      });
    }

    const steamGameData = await game.buildGameDataFromSteam(steam_app_id);
    const updatedGame = await game.update(existingGame.id, steamGameData);
    const publishedGame = await game.makePublic(updatedGame.id);

    const secureOutputValues = authorization.filterOutput(
      userTryingToImport,
      "update:game",
      publishedGame,
    );

    return res.status(200).json(secureOutputValues);
  }

  const developerStudio = await studio.findOneByIdWithMembers(studio_id);

  if (!authorization.can(userTryingToImport, "create:game", developerStudio)) {
    throw new ForbiddenError({
      message: "You do not have permission to create games for this studio",
      action:
        "Verify if you are a member of this studio with game creation rights",
    });
  }

  if (publisher_id) {
    const publisherStudio = await studio.findOneByIdWithMembers(publisher_id);

    if (
      !authorization.can(userTryingToImport, "create:game", publisherStudio)
    ) {
      throw new ForbiddenError({
        message:
          "You do not have permission to attribute this game to the given publisher studio",
        action:
          "Verify if you are a member of the publisher studio with game creation rights",
      });
    }
  }

  const steamGameData = await game.buildGameDataFromSteam(steam_app_id);

  const mergeResult = gameSchema.safeParse({
    ...steamGameData,
    studio_id,
    publisher_id,
  });

  if (!mergeResult.success) {
    throw new ValidationError({
      message: "Steam data could not be mapped into a valid game",
      action:
        "Contact support — the imported Steam data did not pass validation",
      context: mergeResult.error.issues,
    });
  }

  const gameData: GameCreateDto = mergeResult.data;

  const createdGame = await game.create(gameData);
  const publishedGame = await game.makePublic(createdGame.id);

  const secureOutputValues = authorization.filterOutput(
    userTryingToImport,
    "create:game",
    publishedGame,
  );

  return res.status(201).json(secureOutputValues);
}
