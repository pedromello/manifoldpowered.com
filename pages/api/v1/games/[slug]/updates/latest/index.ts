import {
  desktopArchitectureSchema,
  desktopPlatformSchema,
} from "contracts/desktop/v1";
import controller from "infra/controller";
import distributionApi from "infra/distribution_api";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameReleasePatch from "models/game_release_patch";
import library from "models/library";
import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";

const querySchema = z.object({
  slug: z.string().min(1).max(255),
  source_release_id: z.uuid(),
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
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid update resolution request",
      action: "Check the game, installed release, platform and architecture",
      context: query.error.issues,
      cause: query.error,
    });
  }

  const gameResource = await game.findOneBySlugWithStudio(query.data.slug);
  if (!gameResource) {
    throw new NotFoundError({
      message: `Game "${query.data.slug}" was not found.`,
      action: "Check the game slug and try again.",
    });
  }
  if (!(await library.hasItem(req.context.user.id, gameResource.id))) {
    throw new ForbiddenError({
      message: "You do not have access to updates for this game.",
      action: "Acquire the game before resolving an update.",
    });
  }

  const result = await gameReleasePatch.resolveLatestUpdate(
    gameResource.id,
    query.data.source_release_id,
    query.data.platform,
    query.data.arch,
  );
  if (result.state === "UNAVAILABLE") {
    throw distributionApi.withErrorCode(
      new NotFoundError({
        message: "No newer compatible published release was found.",
        action: "Keep the installed release and check again later.",
      }),
      "NO_COMPATIBLE_RELEASE",
    );
  }

  const safePlan = authorization.filterOutput(
    req.context.user,
    "read:library",
    result.plan,
  );
  return res.status(200).json(safePlan);
}
