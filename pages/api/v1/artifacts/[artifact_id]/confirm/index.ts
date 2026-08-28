import { createRouter } from "next-connect";
import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import controller from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameArtifact from "models/game_artifact";
import gameRelease from "models/game_release";

const querySchema = z.object({ artifact_id: z.uuid() });

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
      message: "Invalid artifact id",
      action: "Check the URL and try again",
      cause: query.error,
    });
  }

  const artifact = await gameArtifact.findById(query.data.artifact_id);
  const release = await gameRelease.findById(artifact.release_id);
  const gameResource = await game.findOneByIdWithStudio(release.game_id);
  if (!gameResource) {
    throw new NotFoundError({
      message: "The artifact's game was not found",
      action: "Check the artifact and try again",
    });
  }

  if (
    !authorization.can(req.context.user, "create:game_artifact", gameResource)
  ) {
    throw new ForbiddenError({
      message: "You are not allowed to publish artifacts for this game",
      action: "Use a studio owner or member with artifact upload permission",
    });
  }

  const result = await gameArtifact.confirmUpload(artifact.id);
  const filteredArtifact = authorization.filterOutput(
    req.context.user,
    "create:game_artifact",
    result.artifact,
  );

  return res.status(200).json({
    artifact: filteredArtifact,
    release: {
      id: result.release.id,
      game_id: result.release.game_id,
      version: result.release.version,
      release_number: result.release.release_number,
      status: result.release.status,
      published_at: result.release.published_at,
      created_at: result.release.created_at,
      updated_at: result.release.updated_at,
    },
    published: result.published,
  });
}
