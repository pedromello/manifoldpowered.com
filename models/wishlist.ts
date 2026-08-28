import { prisma } from "infra/database";
import gameModel from "models/game";
import { NotFoundError, ValidationError } from "infra/errors";

async function add(userId: string, slug: string) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  if (game.status === "ONLY_DISPLAY") {
    throw new ValidationError({
      message:
        "This game uses its Steam wishlist instead of a platform wishlist.",
      action: "Open the game's Steam page to add it to your wishlist.",
    });
  }

  await prisma.wishlistItem.upsert({
    where: {
      user_id_game_id: {
        user_id: userId,
        game_id: game.id,
      },
    },
    update: {},
    create: {
      user_id: userId,
      game_id: game.id,
    },
  });
}

async function remove(userId: string, slug: string) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  try {
    await prisma.wishlistItem.delete({
      where: {
        user_id_game_id: {
          user_id: userId,
          game_id: game.id,
        },
      },
    });
  } catch (error) {
    if (error.code !== "P2025") {
      throw error;
    }
  }
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
