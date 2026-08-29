import controller from "infra/controller";
import distributionApi from "infra/distribution_api";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import gameReleasePatch, {
  PatchIntegrityError,
} from "models/game_release_patch";
import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";

const querySchema = z.object({ patch_id: z.uuid() });

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(
    controller.requireAuthentication,
    controller.canRequest("read:library"),
    postHandler,
  )
  .handler(distributionApi.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid patch download request",
      action: "Check the patch id and resolve the update plan again",
      context: query.error.issues,
      cause: query.error,
    });
  }

  let result: Awaited<ReturnType<typeof gameReleasePatch.authorizeDownload>>;
  try {
    result = await gameReleasePatch.authorizeDownload(
      query.data.patch_id,
      req.context.user.id,
    );
  } catch (error) {
    if (error instanceof PatchIntegrityError) {
      throw distributionApi.withErrorCode(error, "INTEGRITY_FAILURE", {
        retryable: false,
        statusCode: 500,
      });
    }
    throw error;
  }

  if (result.state === "MISSING") {
    throw new NotFoundError({
      message: `Patch "${query.data.patch_id}" was not found.`,
      action: "Resolve the update plan again or use the full fallback.",
    });
  }
  if (result.state === "RETIRED") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: `Release "${result.release.id}" has been retired.`,
        action: "Resolve the latest update again or use the full fallback.",
      }),
      "RELEASE_RETIRED",
    );
  }
  if (result.state === "UNAVAILABLE") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: "The incremental patch is not available.",
        action: "Use the full artifact fallback from the update plan.",
      }),
      "NO_COMPATIBLE_RELEASE",
    );
  }
  if (result.state === "FORBIDDEN") {
    throw new ForbiddenError({
      message: "You do not have access to this patch.",
      action: "Acquire the game before requesting its update.",
    });
  }

  const safeAuthorization = authorization.filterOutput(
    req.context.user,
    "read:library",
    result.authorization,
  );
  return res.status(200).json(safeAuthorization);
}
