import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameRelease, { gameReleaseUpdateSchema } from "models/game_release";

const querySchema = z.object({
  slug: z.string().trim().min(1).max(255),
  release_id: z.uuid(),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(
    controller.requireAuthentication,
    controller.canRequest("create:game_release"),
    patchHandler,
  )
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid game release update request",
      action: "Check the game slug and release id",
      context: query.error.issues,
      cause: query.error,
    });
  }

  const body = gameReleaseUpdateSchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError({
      message: "Invalid game release update",
      action: "Provide version or release notes for the draft",
      context: body.error.issues,
      cause: body.error,
    });
  }

  const gameResource = await game.findOneBySlugWithStudio(query.data.slug);
  if (!gameResource) {
    throw new NotFoundError({
      message: `Game "${query.data.slug}" was not found.`,
      action: "Check the game slug and try again.",
    });
  }

  if (
    !authorization.can(req.context.user, "create:game_release", gameResource)
  ) {
    throw new ForbiddenError({
      message: "You are not allowed to update releases for this game",
      action:
        "Use a studio owner or member with release publication permission",
    });
  }

  const release = await gameRelease.findById(query.data.release_id);
  if (release.game_id !== gameResource.id) {
    throw new NotFoundError({
      message: `Release "${query.data.release_id}" was not found.`,
      action: "Check that the release belongs to the requested game.",
    });
  }

  const updated = await gameRelease.updateDraft(release.id, body.data);
  return res
    .status(200)
    .json(
      authorization.filterOutput(
        req.context.user,
        "create:game_release",
        updated,
      ),
    );
}
