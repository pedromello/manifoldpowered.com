import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import game from "models/game";
import storeCuration from "models/store_curation";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";
import { z } from "zod";

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const result = listQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const foundStore = await store.findOneBySlug(slug as string);
  const curationWhere = await storeCuration.getCurationWhereClause(
    foundStore.id,
  );

  const { games, pagination } = await game.findAllPaginated({
    ...result.data,
    order: "featured",
    curationWhere,
  });

  const secureOutputValues = games.map((gameItem) =>
    authorization.filterOutput(req.context.user, "read:public_game", gameItem),
  );

  return res.status(200).json({
    games: secureOutputValues,
    pagination,
  });
}
