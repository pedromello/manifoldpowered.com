import { prisma } from "infra/database";
import { ItemType } from "generated/prisma/client";

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

async function findAllByUserId(userId: string) {
  return await prisma.libraryItem.findMany({
    where: {
      user_id: userId,
    },
    orderBy: {
      acquired_at: "desc",
    },
  });
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
  findAllByUserId,
  hasItem,
};

export default library;
