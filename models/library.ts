import { prisma } from "infra/database";
import { ItemType } from "generated/prisma/client";
import { NotFoundError } from "infra/errors";
import game from "models/game";
import store from "models/store";

async function acquireGame(
  userId: string,
  gameSlug: string,
  storeSlug?: string,
) {
  const existingGame = await game.findOneBySlug(gameSlug);
  if (!existingGame) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Verify the game exists",
    });
  }

  const storeId = await resolveStoreIdLeniently(storeSlug);

  return await prisma.$transaction(async (tx) => {
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
}

// Resolve store_slug leniently: an absent or unknown store must never block
// acquisition — it just means the sale isn't attributed to a store.
async function resolveStoreIdLeniently(
  storeSlug?: string,
): Promise<string | null> {
  if (!storeSlug) return null;

  try {
    const foundStore = await store.findOneBySlug(storeSlug);
    return foundStore.id;
  } catch {
    return null;
  }
}

async function add(
  userId: string,
  itemId: string,
  itemType: ItemType = "GAME",
) {
  return await prisma.libraryItem.upsert({
    where: {
      user_id_item_id_item_type: {
        user_id: userId,
        item_id: itemId,
        item_type: itemType,
      },
    },
    update: {},
    create: {
      user_id: userId,
      item_id: itemId,
      item_type: itemType,
    },
  });
}

async function findAllPaginatedGamesByUserId(
  userId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;

  const [userLibraryItems, totalCount] = await Promise.all([
    prisma.libraryItem.findMany({
      where: {
        user_id: userId,
        item_type: "GAME",
      },
      orderBy: {
        acquired_at: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.libraryItem.count({
      where: {
        user_id: userId,
        item_type: "GAME",
      },
    }),
  ]);

  const gameIds = userLibraryItems.map((item) => item.item_id);

  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
    },
    orderBy: {
      title: "asc",
    },
  });

  const gamesWithLibraryInfo = userLibraryItems.map((item) => {
    const game = games.find((g) => g.id === item.item_id);
    return {
      ...item,
      game,
    };
  });

  return {
    games: gamesWithLibraryInfo,
    pagination: {
      total_items: totalCount,
      total_pages: Math.ceil(totalCount / limit),
      current_page: page,
      items_per_page: limit,
    },
  };
}

async function hasItem(
  userId: string,
  itemId: string,
  itemType: ItemType = "GAME",
): Promise<boolean> {
  const item = await prisma.libraryItem.findUnique({
    where: {
      user_id_item_id_item_type: {
        user_id: userId,
        item_id: itemId,
        item_type: itemType,
      },
    },
  });

  return !!item;
}

const library = {
  add,
  hasItem,
  findAllPaginatedGamesByUserId,
  acquireGame,
};

export default library;
