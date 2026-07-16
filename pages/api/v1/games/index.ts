import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";
import { z } from "zod";

const ORDER_VALUES = [
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "title_asc",
] as const;

// `sort_by` is kept as an alias of `order` (rather than a rename) because
// the /search frontend page already reads and writes `order` query params.
const getQuerySchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    order: z.enum(ORDER_VALUES).optional(),
    sort_by: z.enum(ORDER_VALUES).optional(),
    tags: z
      .string()
      .transform((s) => s.split(","))
      .optional(),
    q: z.string().optional(),
    min_price: z.coerce.number().min(0).optional(),
    max_price: z.coerce.number().min(0).optional(),
  })
  .refine(
    (data) =>
      !(
        data.min_price !== undefined &&
        data.max_price !== undefined &&
        data.min_price > data.max_price
      ),
    {
      message: "min_price must not be greater than max_price",
      path: ["min_price"],
    },
  );

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = getQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { order, sort_by, ...rest } = result.data;

  const { games, pagination } = await game.findAllPaginated({
    ...rest,
    order: sort_by ?? order ?? "newest",
  });

  const secureOutputValues = games.map((gameItem) =>
    authorization.filterOutput(req.context.user, "read:public_game", gameItem),
  );

  return res.status(200).json({
    games: secureOutputValues,
    pagination,
  });
}
