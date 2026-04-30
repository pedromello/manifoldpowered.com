import { createRouter } from "next-connect";
import controller from "infra/controller";
import library from "models/library";
import authorization from "models/authorization";
import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { ValidationError } from "infra/errors";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:library"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsedQuery = querySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    throw new ValidationError({
      message: "Query validation failed.",
      action: "Check the 'page' and 'limit' parameters.",
      cause: parsedQuery.error,
    });
  }

  const { page, limit } = parsedQuery.data;

  const result = await library.findAllPaginatedGamesByUserId(
    req.context.user.id!,
    page,
    limit,
  );

  const filteredGames = result.games.map((item) => {
    return authorization.filterOutput(req.context.user, "read:library", item);
  });

  return res.status(200).json({
    games: filteredGames,
    pagination: result.pagination,
  });
}
