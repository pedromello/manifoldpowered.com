import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game, { gameAdminQuerySchema } from "models/game";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:game:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = gameAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { games, pagination } = await game.findAllPaginatedAdmin(result.data);

  const secureOutputValues = games.map((gameItem) =>
    authorization.filterOutput(req.context.user, "read:game:any", gameItem),
  );

  return res.status(200).json({
    games: secureOutputValues,
    pagination,
  });
}
