import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import studio from "models/studio";
import game from "models/game";
import authorization from "models/authorization";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:studio:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const foundStudio = await studio.findOneBySlug(slug as string);

  const { games, pagination } = await game.findAllPaginatedAdmin({
    studio_id: foundStudio.id,
    limit: 100,
  });

  const secureStudioOutput = authorization.filterOutput(
    req.context.user,
    "read:studio:any",
    foundStudio,
  );

  const secureGamesOutput = games.map((gameItem) =>
    authorization.filterOutput(req.context.user, "read:game:any", gameItem),
  );

  return res.status(200).json({
    studio: secureStudioOutput,
    games: secureGamesOutput,
    gamesPagination: pagination,
  });
}
