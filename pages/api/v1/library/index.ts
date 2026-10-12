import { createRouter } from "next-connect";
import controller from "infra/controller";
import library from "models/library";
import authorization from "models/authorization";
import region from "models/region";
import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { ValidationError } from "infra/errors";
import game from "models/game";
import pricing from "models/pricing";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  slug: z.string().min(1).max(255).optional(),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:library"), getHandler)
  .post(controller.canRequest("create:library"), postHandler)
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

  const { page, limit, slug } = parsedQuery.data;

  const [result, isOwned] = await Promise.all([
    library.findAllPaginatedGamesByUserId(req.context.user.id!, page, limit),
    slug ? library.hasGameBySlug(req.context.user.id!, slug) : false,
  ]);

  const filteredGames = result.games.map((item) => {
    return authorization.filterOutput(req.context.user, "read:library", item);
  });

  return res.status(200).json({
    games: filteredGames,
    ...(slug ? { is_owned: isOwned } : {}),
    pagination: result.pagination,
  });
}

const postBodySchema = z.object({
  slug: z.string().min(1).max(255),
  store_slug: z.string().min(1).max(255).optional(),
});

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsedBody = postBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new ValidationError({
      message: "Body validation failed.",
      action: "Check the context fields for more information.",
      context: parsedBody.error.issues,
      cause: parsedBody.error,
    });
  }

  // The same currency the visitor was shown a price in, so the sale and its
  // ledger entries record what they were actually charged.
  const currencyCode = await region.currencyForRequest(req);
  const target = await game.findOneBySlug(parsedBody.data.slug);
  if (
    target &&
    (!(await pricing.priceForOrFail(target, currencyCode)).amount.isZero() ||
      Boolean((await pricing.priceFor(target, "BRL"))?.amount.greaterThan(0)))
  ) {
    return res.status(409).json({
      message:
        "Complete payment through checkout to add this game to your library.",
      checkout_required: true,
    });
  }

  const result = await library.acquireGame(
    req.context.user.id!,
    parsedBody.data.slug,
    parsedBody.data.store_slug,
    currencyCode,
  );

  return res.status(201).json({
    id: result.id,
    user_id: result.user_id,
    game_id: result.item_id,
    acquired_at: result.acquired_at,
  });
}
