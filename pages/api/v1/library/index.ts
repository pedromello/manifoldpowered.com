import { createRouter } from "next-connect";
import controller from "infra/controller";
import library from "models/library";
import authorization from "models/authorization";
import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import game from "models/game";
import store from "models/store";
import { prisma } from "infra/database";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
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

  const existingGame = await game.findOneBySlug(parsedBody.data.slug);
  if (!existingGame) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Verify the game exists",
    });
  }

  // Resolve store_slug leniently: an absent or unknown store must never
  // block acquisition — it just means the sale isn't attributed to a store.
  let storeId: string | null = null;
  if (parsedBody.data.store_slug) {
    try {
      const foundStore = await store.findOneBySlug(parsedBody.data.store_slug);
      storeId = foundStore.id;
    } catch {
      storeId = null;
    }
  }

  const userId = req.context.user.id!;

  const result = await prisma.$transaction(async (tx) => {
    const libraryItem = await tx.libraryItem.upsert({
      where: {
        user_id_item_id_item_type: {
          user_id: userId,
          item_id: existingGame.id,
          item_type: "GAME",
        },
      },
      update: {},
      create: {
        user_id: userId,
        item_id: existingGame.id,
        item_type: "GAME",
      },
    });

    await tx.sale.create({
      data: {
        user_id: userId,
        game_id: existingGame.id,
        store_id: storeId,
        price_at_sale: existingGame.price,
      },
    });

    return libraryItem;
  });

  return res.status(201).json({
    id: result.id,
    user_id: result.user_id,
    game_id: result.item_id,
    acquired_at: result.acquired_at,
  });
}
