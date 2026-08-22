import { prisma } from "infra/database";
import gameModel from "models/game";
import library from "models/library";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { Prisma } from "generated/prisma/client";

async function add(
  userId: string,
  slug: string,
  message: string,
  recommended: boolean,
) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  if (!(await library.hasItem(userId, game.id))) {
    throw new ForbiddenError({
      message: "Only players who own this game can review it.",
      action: "Add the game to your library before posting a review.",
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          user_id: userId,
          game_id: game.id,
          message,
          recommended,
        },
      });

      const incrementField = recommended
        ? "positive_reviews"
        : "negative_reviews";

      const updatedGame = await tx.game.update({
        where: { id: game.id },
        data: {
          [incrementField]: { increment: 1 },
        },
      });

      const newScore = gameModel.calculateReviewScore(
        updatedGame.positive_reviews,
        updatedGame.negative_reviews,
      );

      await tx.game.update({
        where: { id: game.id },
        data: {
          review_score: newScore,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: "You have already reviewed this game.",
        action: "You can only post one review per game.",
      });
    }
    throw error;
  }
}

async function update(
  userId: string,
  slug: string,
  message: string,
  recommended: boolean,
) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  if (!(await library.hasItem(userId, game.id))) {
    throw new ForbiddenError({
      message: "Only players who own this game can review it.",
      action: "Add the game to your library before updating a review.",
    });
  }

  const existingReview = await prisma.review.findUnique({
    where: {
      user_id_game_id: {
        user_id: userId,
        game_id: game.id,
      },
    },
  });

  if (!existingReview) {
    throw new NotFoundError({
      message: "Review not found.",
      action: "Post a review before trying to update it.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: existingReview.id },
      data: { message, recommended },
    });

    if (existingReview.recommended === recommended) return;

    const updatedGame = await tx.game.update({
      where: { id: game.id },
      data: recommended
        ? {
            positive_reviews: { increment: 1 },
            negative_reviews: { decrement: 1 },
          }
        : {
            positive_reviews: { decrement: 1 },
            negative_reviews: { increment: 1 },
          },
    });

    await tx.game.update({
      where: { id: game.id },
      data: {
        review_score: gameModel.calculateReviewScore(
          updatedGame.positive_reviews,
          updatedGame.negative_reviews,
        ),
      },
    });
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

  const existingReview = await prisma.review.findUnique({
    where: {
      user_id_game_id: {
        user_id: userId,
        game_id: game.id,
      },
    },
  });

  if (!existingReview) {
    throw new NotFoundError({
      message: "Review not found.",
      action: "Check if you have already deleted this review.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({
      where: {
        id: existingReview.id,
      },
    });

    const decrementField = existingReview.recommended
      ? "positive_reviews"
      : "negative_reviews";

    const updatedGame = await tx.game.update({
      where: { id: game.id },
      data: {
        [decrementField]: { decrement: 1 },
      },
    });

    const newScore = gameModel.calculateReviewScore(
      updatedGame.positive_reviews,
      updatedGame.negative_reviews,
    );

    await tx.game.update({
      where: { id: game.id },
      data: {
        review_score: newScore,
      },
    });
  });
}

async function getPaginatedReviewsBySlug(
  slug: string,
  page: number,
  limit: number,
  userId?: string,
) {
  const game = await gameModel.findOnePublicBySlug(slug);

  if (!game) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check if the slug is correct.",
    });
  }

  const skip = (page - 1) * limit;

  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where: { game_id: game.id },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.review.count({
      where: { game_id: game.id },
    }),
  ]);

  const userIds = reviews.map((r) => r.user_id);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });

  const userMap = users.reduce(
    (acc, user) => {
      acc[user.id] = user;
      return acc;
    },
    {} as Record<string, { id: string; username: string }>,
  );

  const reviewsWithUser = reviews.map((r) => ({
    ...r,
    user: userMap[r.user_id] || { username: "Unknown" },
  }));

  let userReview = null;
  let canReview = false;
  if (userId) {
    const [ownReview, ownUser, ownsGame] = await Promise.all([
      prisma.review.findUnique({
        where: {
          user_id_game_id: {
            user_id: userId,
            game_id: game.id,
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      }),
      library.hasItem(userId, game.id),
    ]);

    canReview = ownsGame;

    userReview = ownReview
      ? {
          ...ownReview,
          user: ownUser || { id: userId, username: "Unknown" },
        }
      : null;
  }

  return {
    reviews: reviewsWithUser,
    user_review: userReview,
    can_review: canReview,
    summary: {
      positive_reviews: game.positive_reviews,
      negative_reviews: game.negative_reviews,
      review_score: game.review_score,
    },
    pagination: {
      total_items: totalCount,
      total_pages: Math.ceil(totalCount / limit),
      current_page: page,
      items_per_page: limit,
    },
  };
}

const review = {
  add,
  update,
  remove,
  getPaginatedReviewsBySlug,
};

export default review;
