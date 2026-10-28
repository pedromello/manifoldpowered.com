import { prisma } from "infra/database";
import { recordDomainEvent } from "models/product_event";
import type { ProductEventContext } from "infra/product_event_context";
import gameModel from "models/game";
import { NotFoundError } from "infra/errors";

async function add(
  userId: string,
  slug: string,
  context?: ProductEventContext,
) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.wishlistItem.createManyAndReturn({
      data: [{ user_id: userId, game_id: game.id }],
      skipDuplicates: true,
      select: { id: true },
    });
    if (created[0])
      await recordDomainEvent(tx, {
        name: "game_wishlisted",
        relation_id: created[0].id,
        user_id: userId,
        game_id: game.id,
        context,
      });
  });
}

async function remove(
  userId: string,
  slug: string,
  context?: ProductEventContext,
) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  await prisma.$transaction(async (tx) => {
    const removed = await tx.$queryRaw<Array<{ id: string }>>`
      DELETE FROM wishlist_items WHERE user_id = ${userId} AND game_id = ${game.id} RETURNING id
    `;
    if (removed[0])
      await recordDomainEvent(tx, {
        name: "game_unwishlisted",
        relation_id: removed[0].id,
        user_id: userId,
        game_id: game.id,
        context,
      });
  });
}

async function getCountsAndStatus(userId: string | undefined, slug: string) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  const count = await prisma.wishlistItem.count({
    where: {
      game_id: game.id,
    },
  });

  let isWishlisted = false;
  if (userId) {
    const userWishlist = await prisma.wishlistItem.findUnique({
      where: {
        user_id_game_id: {
          user_id: userId,
          game_id: game.id,
        },
      },
    });
    isWishlisted = !!userWishlist;
  }

  return {
    count,
    is_wishlisted: isWishlisted,
  };
}

const wishlist = {
  add,
  remove,
  getCountsAndStatus,
};

export default wishlist;
