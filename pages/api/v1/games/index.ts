import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";
import { z } from "zod";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const getQuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    order: z
      .enum(["newest", "oldest", "price_asc", "price_desc", "title_asc"])
      .default("newest"),
    tags: z
      .string()
      .transform((s) => s.split(","))
      .optional(),
    q: z.string().optional(),
  });

  const result = getQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { games, pagination } = await game.findAllPaginated(result.data);

  const secureOutputValues = games.map((gameItem) =>
    authorization.filterOutput(
      req.context.user,
      "read:public_game",
      gameItem,
    ),
  );

  return res.status(200).json({
    games: secureOutputValues,
    pagination,
  });
}
