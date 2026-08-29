import controller from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameRelease from "models/game_release";
import gameReleasePatch from "models/game_release_patch";
import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";

const querySchema = z.object({ patch_id: z.uuid() });

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(
    controller.requireAuthentication,
    controller.canRequest("create:game_artifact"),
    postHandler,
  )
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid patch id",
      action: "Check the URL and try again",
      context: query.error.issues,
      cause: query.error,
    });
  }

  const patch = await gameReleasePatch.findById(query.data.patch_id);
  const targetRelease = await gameRelease.findById(patch.target_release_id);
  const gameResource = await game.findOneByIdWithStudio(targetRelease.game_id);
  if (!gameResource) {
    throw new NotFoundError({
      message: "The patch's game was not found",
      action: "Check the patch references and try again",
    });
  }
  if (
    !authorization.can(req.context.user, "create:game_artifact", gameResource)
  ) {
    throw new ForbiddenError({
      message: "You are not allowed to confirm patches for this game",
      action: "Use a studio owner or member with artifact upload permission",
    });
  }

  const confirmed = await gameReleasePatch.confirmUpload(patch.id);
  const safePatch = authorization.filterOutput(
    req.context.user,
    "create:game_artifact",
    confirmed,
  );
  return res.status(200).json({ patch: safePatch });
}
