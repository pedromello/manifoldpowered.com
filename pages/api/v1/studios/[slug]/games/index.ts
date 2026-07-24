import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import studio from "models/studio";
import game from "models/game";
import authorization from "models/authorization";
import { ForbiddenError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("update:studio"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const userTryingToRead = req.context.user;
  const foundStudio = await studio.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToRead, "update:studio", foundStudio)) {
    throw new ForbiddenError({
      message: "You do not have permission to view this studio's games",
      action: "Verify if you are an administrator of this studio",
    });
  }

  const { games, pagination } = await game.findAllPaginatedAdmin({
    studio_id: foundStudio.id,
    limit: 100,
  });

  const secureOutputValues = games.map((gameItem) =>
    authorization.filterOutput(userTryingToRead, "update:game", gameItem),
  );

  return res.status(200).json({
    games: secureOutputValues,
    pagination,
  });
}
