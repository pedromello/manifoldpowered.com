import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameRelease, { gameReleaseCreateSchema } from "models/game_release";

const querySchema = z.object({
  slug: z.string().trim().min(1).max(255),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const bodySchema = gameReleaseCreateSchema.omit({ game_id: true }).strict();

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(
    controller.requireAuthentication,
    controller.canRequest("create:game_release"),
    getHandler,
  )
  .post(
    controller.requireAuthentication,
    controller.canRequest("create:game_release"),
    postHandler,
  )
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid game release list request",
      action: "Check the game slug, page, and limit parameters",
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

  if (
    !authorization.can(req.context.user, "create:game_release", gameResource)
  ) {
    throw new ForbiddenError({
      message: "You are not allowed to view releases for this game",
      action:
        "Use a studio owner or member with release publication permission",
    });
  }

  const result = await gameRelease.listByGame(gameResource.id, {
    page: query.data.page,
    limit: query.data.limit,
  });

  return res.status(200).json({
    game: {
      id: gameResource.id,
      slug: gameResource.slug,
      title: gameResource.title,
    },
    releases: result.releases.map((release) => ({
      ...authorization.filterOutput(
        req.context.user,
        "create:game_release",
        release,
      ),
      artifacts: release.artifacts.map((artifact) =>
        authorization.filterOutput(
          req.context.user,
          "create:game_artifact",
          artifact,
        ),
      ),
    })),
    pagination: result.pagination,
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid game release request",
      action: "Check the game slug and try again",
      context: query.error.issues,
      cause: query.error,
    });
  }

  const body = bodySchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError({
      message: "Invalid game release declaration",
      action: "Check the version and release notes",
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
      message: "You are not allowed to create releases for this game",
      action: "Use a studio owner or member with release creation permission",
    });
  }

  const release = await gameRelease.createDraft({
    game_id: gameResource.id,
    ...body.data,
  });
  const safeRelease = authorization.filterOutput(
    req.context.user,
    "create:game_release",
    release,
  );

  return res.status(201).json(safeRelease);
}
