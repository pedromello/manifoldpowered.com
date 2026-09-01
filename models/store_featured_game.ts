import { Prisma, type StoreRevision } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import storeCuration from "models/store_curation";
import { z } from "zod";

export const MAX_FEATURED_GAMES = 3;
export const MAX_RECOMMENDATION_REASON_LENGTH = 240;

const recommendationSchema = z.object({
  game_slug: z.string().trim().min(1).max(255),
  recommendation_reason: z
    .string()
    .trim()
    .max(MAX_RECOMMENDATION_REASON_LENGTH)
    .nullish()
    .transform((reason) => reason || null),
});

const recommendationsSchema = z
  .array(recommendationSchema)
  .min(1)
  .max(MAX_FEATURED_GAMES)
  .superRefine((recommendations, context) => {
    const gameSlugs = recommendations.map(({ game_slug }) => game_slug);
    if (new Set(gameSlugs).size !== gameSlugs.length) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "Featured games must be unique.",
      });
    }
  });

export const featuredGameSelectionSchema = z.union([
  z.object({ recommendations: recommendationsSchema }),
  z
    .object({
      game_slugs: z
        .array(z.string().trim().min(1).max(255))
        .min(1)
        .max(MAX_FEATURED_GAMES),
    })
    .transform(({ game_slugs }) => ({
      recommendations: game_slugs.map((game_slug) => ({
        game_slug,
        recommendation_reason: null,
      })),
    }))
    .superRefine(({ recommendations }, context) => {
      const gameSlugs = recommendations.map(({ game_slug }) => game_slug);
      if (new Set(gameSlugs).size !== gameSlugs.length) {
        context.addIssue({
          code: "custom",
          path: ["game_slugs"],
          message: "Featured games must be unique.",
        });
      }
    }),
]);

export type FeaturedRecommendation = z.infer<typeof recommendationSchema>;

interface EditorialGameQuery {
  storeId: string;
  curationWhere: Prisma.GameWhereInput;
  priceableGameIds?: string[] | null;
  page: number;
  limit: number;
  publishedRevision?: StoreRevision;
}

const publishedFeaturedGamesSchema = z
  .array(
    z
      .object({
        game_id: z.string().min(1),
        position: z.number().int().min(1).max(MAX_FEATURED_GAMES),
        recommendation_reason: z
          .string()
          .max(MAX_RECOMMENDATION_REASON_LENGTH)
          .nullable(),
      })
      .strict(),
  )
  .max(MAX_FEATURED_GAMES)
  .superRefine((selection, context) => {
    const gameIds = selection.map(({ game_id }) => game_id);
    const positions = selection.map(({ position }) => position);
    if (new Set(gameIds).size !== gameIds.length) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "Published Featured games must be unique",
      });
    }
    if (
      new Set(positions).size !== positions.length ||
      [...positions]
        .sort((a, b) => a - b)
        .some((position, index) => position !== index + 1)
    ) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "Published Featured positions must be contiguous",
      });
    }
  });

async function replaceSelection(
  storeId: string,
  recommendations: FeaturedRecommendation[],
) {
  const curationWhere = await storeCuration.getCurationWhereClause(storeId);
  const gameSlugs = recommendations.map(({ game_slug }) => game_slug);

  return prisma.$transaction(async (transaction) => {
    const andClauses: Prisma.GameWhereInput[] = [];
    if (Object.keys(curationWhere).length > 0) {
      andClauses.push(curationWhere);
    }

    const games = await transaction.game.findMany({
      where: {
        slug: { in: gameSlugs },
        status: "ACTIVE",
        ...(andClauses.length > 0 && { AND: andClauses }),
      },
      select: { id: true, slug: true },
    });

    const gameBySlug = new Map(games.map((game) => [game.slug, game]));
    const ineligibleSlugs = gameSlugs.filter((slug) => !gameBySlug.has(slug));

    if (ineligibleSlugs.length > 0) {
      throw new ValidationError({
        message: "One or more games cannot be featured by this Outlet.",
        action:
          "Choose active games that are currently included in the Outlet catalog.",
        context: { game_slugs: ineligibleSlugs },
      });
    }

    await transaction.storeFeaturedGame.deleteMany({
      where: { store_id: storeId },
    });
    await transaction.storeFeaturedGame.createMany({
      data: recommendations.map((recommendation, index) => ({
        store_id: storeId,
        game_id: gameBySlug.get(recommendation.game_slug)!.id,
        position: index + 1,
        recommendation_reason: recommendation.recommendation_reason,
      })),
    });
    await transaction.store.update({
      where: { id: storeId },
      data: { draft_revision: { increment: 1 } },
    });

    return recommendations.map((recommendation, index) => ({
      ...recommendation,
      position: index + 1,
    }));
  });
}

async function resetSelection(storeId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.storeFeaturedGame.deleteMany({
      where: { store_id: storeId },
    });
    await transaction.store.update({
      where: { id: storeId },
      data: { draft_revision: { increment: 1 } },
    });
  });
}

async function findAvailableEditorialGames({
  storeId,
  curationWhere,
  priceableGameIds,
  page,
  limit,
  publishedRevision,
}: EditorialGameQuery) {
  const selection = publishedRevision
    ? publishedFeaturedGamesSchema
        .parse(publishedRevision.featured_games)
        .sort((a, b) => a.position - b.position)
    : await prisma.storeFeaturedGame.findMany({
        where: { store_id: storeId },
        orderBy: { position: "asc" },
      });

  if (selection.length === 0) {
    return null;
  }

  const andClauses: Prisma.GameWhereInput[] = [];
  if (Object.keys(curationWhere).length > 0) {
    andClauses.push(curationWhere);
  }
  if (priceableGameIds !== null && priceableGameIds !== undefined) {
    andClauses.push({ id: { in: priceableGameIds } });
  }

  const games = await prisma.game.findMany({
    where: {
      id: { in: selection.map((entry) => entry.game_id) },
      status: "ACTIVE",
      ...(andClauses.length > 0 && { AND: andClauses }),
    },
  });

  const gameById = new Map(games.map((game) => [game.id, game]));
  const orderedGames = selection
    .map((entry) => {
      const selectedGame = gameById.get(entry.game_id);
      return selectedGame
        ? {
            ...selectedGame,
            recommendation_reason: entry.recommendation_reason,
          }
        : undefined;
    })
    .filter((game) => game !== undefined);
  const total = orderedGames.length;
  const paginatedGames = orderedGames.slice((page - 1) * limit, page * limit);

  return {
    games: paginatedGames,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

const storeFeaturedGame = {
  replaceSelection,
  resetSelection,
  findAvailableEditorialGames,
};

export default storeFeaturedGame;
