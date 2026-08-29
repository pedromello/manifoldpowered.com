import { releasePatchUploadRequestSchema } from "contracts/desktop/v1";
import controller from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameRelease from "models/game_release";
import gameReleasePatch from "models/game_release_patch";
import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";

// Next.js requires every route below /releases/[...]/ to reuse the existing
// dynamic segment name. The public OpenAPI parameter remains target_release_id.
const querySchema = z.object({ release_id: z.uuid() });

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
      message: "Invalid target release id",
      action: "Check the URL and try again",
      context: query.error.issues,
      cause: query.error,
    });
  }

  const targetRelease = await gameRelease.findById(query.data.release_id);
  const gameResource = await game.findOneByIdWithStudio(targetRelease.game_id);
  if (!gameResource) {
    throw new NotFoundError({
      message: "The target release's game was not found",
      action: "Check the target release and try again",
    });
  }
  if (
    !authorization.can(req.context.user, "create:game_artifact", gameResource)
  ) {
    throw new ForbiddenError({
      message: "You are not allowed to upload patches for this game",
      action: "Use a studio owner or member with artifact upload permission",
    });
  }

  const body = releasePatchUploadRequestSchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError({
      message: "Invalid release patch declaration",
      action: "Check the releases, target, hashes, sizes and Wharf version",
      context: body.error.issues,
      cause: body.error,
    });
  }

  const result = await gameReleasePatch.initiateUpload(
    targetRelease.id,
    req.context.user.id,
    body.data,
  );
  const safePatch = authorization.filterOutput(
    req.context.user,
    "create:game_artifact",
    result.patch,
  );

  return res.status(result.created ? 201 : 200).json({
    patch: safePatch,
    uploads: result.uploads,
  });
}
