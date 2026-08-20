import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import {
  desktopArchitectureSchema,
  desktopPlatformSchema,
} from "contracts/desktop/v1";
import controller from "infra/controller";
import distributionApi from "infra/distribution_api";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameRelease from "models/game_release";
import library from "models/library";
import { z } from "zod";

const querySchema = z.object({
  slug: z.string().min(1).max(255),
  platform: desktopPlatformSchema,
  arch: desktopArchitectureSchema,
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
  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid release target",
      action: "Check the game slug, platform, and architecture",
      context: queryParse.error.issues,
      cause: queryParse.error,
    });
  }

  const { slug, platform, arch } = queryParse.data;
  const gameResource = await game.findOneBySlugWithStudio(slug);

  if (!gameResource) {
    throw new NotFoundError({
      message: `Game "${slug}" was not found.`,
      action: "Check the game slug and try again.",
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
      message: "You do not have access to this game release.",
      action: "Acquire the game before requesting a release.",
    });
  }

  const result = await gameRelease.findLatestCompatible(
    gameResource.id,
    platform,
    arch,
  );

  if (!result) {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: "No compatible published release was found.",
        action: "Check the requested platform and architecture.",
      }),
      "NO_COMPATIBLE_RELEASE",
    );
  }

  const safeRelease = authorization.filterOutput(
    req.context.user,
    "read:library",
    result,
  );

  return res.status(200).json(safeRelease);
}
