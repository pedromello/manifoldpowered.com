import { createRouter } from "next-connect";
import controller from "infra/controller";
import library from "models/library";
import authorization from "models/authorization";
import { prisma } from "infra/database";
import { NextApiRequest, NextApiResponse } from "next";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:library"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const libraryItems = await library.findAllByUserId(req.context.user.id!);

  // Since we don't use foreign keys, we manually fetch the games
  const gameIds = libraryItems
    .filter((item) => item.item_type === "GAME")
    .map((item) => item.item_id);

  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      media: true,
      developer_name: true,
    },
  });

  // Merge game data with library acquired_at date
  const response = libraryItems.map((item) => {
    const gameData = games.find((g) => g.id === item.item_id);
    return authorization.filterOutput(req.context.user, "read:library", {
      ...item,
      game: gameData || null,
    });
  });

  return res.status(200).json(response);
}
