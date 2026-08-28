import { createRouter } from "next-connect";
import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import controller from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameArtifact, { gameArtifactUploadSchema } from "models/game_artifact";
import gameRelease from "models/game_release";

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
      message: "Invalid release id",
      action: "Check the URL and try again",
      cause: query.error,
    });
  }

  const release = await gameRelease.findById(query.data.release_id);
  const gameResource = await game.findOneByIdWithStudio(release.game_id);
  if (!gameResource) {
    throw new NotFoundError({
      message: "The release's game was not found",
      action: "Check the release and try again",
    });
  }

  if (
    !authorization.can(req.context.user, "create:game_artifact", gameResource)
  ) {
    throw new ForbiddenError({
      message: "You are not allowed to upload artifacts for this game",
      action: "Use a studio owner or member with artifact upload permission",
    });
  }

  const body = gameArtifactUploadSchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError({
      message: "Invalid artifact upload declaration",
      action: "Check the target, sizes, SHA-256 and manifest",
      cause: body.error,
    });
  }

  const result = await gameArtifact.initiateUpload(
    release.id,
    req.context.user.id,
    body.data,
  );
  const artifact = authorization.filterOutput(
    req.context.user,
    "create:game_artifact",
    result.artifact,
  );

  return res.status(result.created ? 201 : 200).json({
    artifact,
    upload: result.upload,
  });
}
