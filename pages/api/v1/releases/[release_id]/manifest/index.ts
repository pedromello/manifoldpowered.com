import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { manifestSchemaVersionSchema } from "contracts/desktop/v1";
import controller from "infra/controller";
import distributionApi from "infra/distribution_api";
import {
  ForbiddenError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameRelease from "models/game_release";
import library from "models/library";
import { z } from "zod";

const querySchema = z.object({
  release_id: z.uuid(),
  schema_version: manifestSchemaVersionSchema,
  artifact_id: z.uuid().optional(),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(
    controller.requireAuthentication,
    controller.canRequest("read:library"),
    getHandler,
  )
  .handler(distributionApi.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  if (
    typeof req.query.schema_version === "string" &&
    req.query.schema_version !== "1"
  ) {
    throw distributionApi.withErrorCode(
      new ValidationError({
        message: `Manifest schema version "${req.query.schema_version}" is not supported`,
        action: "Request manifest schema version 1",
      }),
      "UNSUPPORTED_MANIFEST_VERSION",
    );
  }

  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid manifest request",
      action: "Check the release id, artifact id, and schema version",
      context: queryParse.error.issues,
      cause: queryParse.error,
    });
  }

  const {
    release_id: releaseId,
    schema_version: schemaVersion,
    artifact_id: artifactId,
  } = queryParse.data;
  const release = await gameRelease.findById(releaseId);
  const gameResource = await game.findOneByIdWithStudio(release.game_id);

  if (!gameResource) {
    throw new NotFoundError({
      message: `Game "${release.game_id}" was not found.`,
      action: "Contact support to repair the release reference.",
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
      message: "You do not have access to this install manifest.",
      action: "Acquire the game before requesting its manifest.",
    });
  }

  if (release.status === "RETIRED") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: `Release "${release.id}" has been retired.`,
        action: "Resolve the latest compatible release and try again.",
      }),
      "RELEASE_RETIRED",
    );
  }

  if (release.status !== "PUBLISHED") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: "No published install manifest was found.",
        action: "Resolve the latest compatible release and try again.",
      }),
      "NO_COMPATIBLE_RELEASE",
    );
  }

  let result: Awaited<ReturnType<typeof gameRelease.findPublishedManifest>>;
  try {
    result = await gameRelease.findPublishedManifest(
      release.id,
      schemaVersion,
      artifactId,
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      throw distributionApi.withErrorCode(error, "INTEGRITY_FAILURE", {
        retryable: false,
        statusCode: 500,
      });
    }
    throw error;
  }

  if (result.state === "RETIRED") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: `Release "${release.id}" has been retired.`,
        action: "Resolve the latest compatible release and try again.",
      }),
      "RELEASE_RETIRED",
    );
  }

  if (result.state === "UNAVAILABLE") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: "No published install manifest was found.",
        action: "Resolve the latest compatible release and try again.",
      }),
      "NO_COMPATIBLE_RELEASE",
    );
  }

  const safeManifest = authorization.filterOutput(
    req.context.user,
    "read:library",
    result.manifest,
  );
  return res.status(200).json(safeManifest);
}
