import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import distributionApi from "infra/distribution_api";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameArtifact, { ArtifactIntegrityError } from "models/game_artifact";
import gameRelease from "models/game_release";
import library from "models/library";
import { z } from "zod";

const querySchema = z.object({ artifact_id: z.uuid() });

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(
    controller.requireAuthentication,
    controller.canRequest("read:library"),
    postHandler,
  )
  .handler(distributionApi.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid artifact download request",
      action: "Check the artifact id and try again",
      context: queryParse.error.issues,
      cause: queryParse.error,
    });
  }

  const artifact = await gameArtifact.findById(queryParse.data.artifact_id);
  const release = await gameRelease.findById(artifact.release_id);
  const gameResource = await game.findOneByIdWithStudio(release.game_id);
  if (!gameResource) {
    throw new NotFoundError({
      message: "The artifact's game was not found.",
      action: "Contact support to repair the artifact reference.",
    });
  }

  const hasGameOwnership = authorization.can(
    req.context.user,
    "update:game",
    gameResource,
  );
  const hasEntitlement = await library.hasItem(
    req.context.user.id,
    gameResource.id,
  );
  if (!hasGameOwnership && !hasEntitlement) {
    throw new ForbiddenError({
      message: "You do not have access to this artifact.",
      action: "Acquire the game before requesting its download.",
    });
  }

  let result: Awaited<ReturnType<typeof gameArtifact.authorizeDownload>>;
  try {
    result = await gameArtifact.authorizeDownload(
      artifact.id,
      req.context.user,
    );
  } catch (error) {
    if (error instanceof ArtifactIntegrityError) {
      throw distributionApi.withErrorCode(error, "INTEGRITY_FAILURE", {
        retryable: false,
        statusCode: 500,
      });
    }
    throw error;
  }

  if (result.state === "MISSING") {
    throw new NotFoundError({
      message: `Artifact "${artifact.id}" was not found.`,
      action: "Resolve the latest compatible release and try again.",
    });
  }
  if (result.state === "RETIRED") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: `Release "${result.release.id}" has been retired.`,
        action: "Resolve the latest compatible release and try again.",
      }),
      "RELEASE_RETIRED",
    );
  }
  if (result.state === "UNAVAILABLE") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: "No compatible published artifact was found.",
        action: "Resolve the latest compatible release and try again.",
      }),
      "NO_COMPATIBLE_RELEASE",
    );
  }
  if (result.state === "FORBIDDEN") {
    throw new ForbiddenError({
      message: "You do not have access to this artifact.",
      action: "Acquire the game before requesting its download.",
    });
  }

  const safeAuthorization = authorization.filterOutput(
    req.context.user,
    "read:library",
    result.authorization,
  );
  return res.status(200).json(safeAuthorization);
}
