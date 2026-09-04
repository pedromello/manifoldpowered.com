import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ConflictError, ValidationError } from "infra/errors";
import { getCurationWhereClause } from "models/store_catalog";
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
  z.object({
    recommendations: recommendationsSchema,
    expected_draft_revision: z.number().int().min(1),
  }),
  z
    .object({
      game_slugs: z
        .array(z.string().trim().min(1).max(255))
        .min(1)
        .max(MAX_FEATURED_GAMES),
      expected_draft_revision: z.number().int().min(1),
    })
    .transform(({ game_slugs, expected_draft_revision }) => ({
      recommendations: game_slugs.map((game_slug) => ({
        game_slug,
        recommendation_reason: null,
      })),
      expected_draft_revision,
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

export const featuredGameResetSchema = z
  .object({ expected_draft_revision: z.number().int().min(1) })
  .strict();

export type FeaturedRecommendation = z.infer<typeof recommendationSchema>;

interface EditorialGameQuery {
  storeId: string;
  curationWhere: Prisma.GameWhereInput;
  priceableGameIds?: string[] | null;
  page: number;
  limit: number;
}

async function incrementDraftRevision(
  storeId: string,
  transaction: Prisma.TransactionClient,
  expectedDraftRevision?: number,
) {
  const current = await transaction.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { draft_revision: true },
  });
  const expected = expectedDraftRevision ?? current.draft_revision;
  const updated = await transaction.store.updateMany({
    where: { id: storeId, draft_revision: expected },
    data: { draft_revision: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw featuredConflict(expected, current.draft_revision);
  }
}

function featuredConflict(expected: number, actual: number) {
  return new ConflictError({
    message: "The Outlet draft changed before Featured was saved.",
    action: "Refresh Featured, review the latest selection, and try again.",
    context: {
      expected_draft_revision: expected,
      actual_draft_revision: actual,
    },
  });
}

async function mapFeaturedConflict(
  error: unknown,
  storeId: string,
  expectedDraftRevision?: number,
): Promise<never> {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    const latest = await prisma.store.findUnique({
      where: { id: storeId },
      select: { draft_revision: true },
    });
    throw featuredConflict(
      expectedDraftRevision ?? latest?.draft_revision ?? 1,
      latest?.draft_revision ?? 1,
    );
  }
  throw error;
}

async function replaceSelection(
  storeId: string,
  recommendations: FeaturedRecommendation[],
  expectedDraftRevision?: number,
) {
  const gameSlugs = recommendations.map(({ game_slug }) => game_slug);

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const curationWhere = await getCurationWhereClause(
          storeId,
          transaction,
        );
        const andClauses: Prisma.GameWhereInput[] = [];
        if (Object.keys(curationWhere).length > 0) {
          andClauses.push(curationWhere);
        }

        const games = await transaction.game.findMany({
          where: {
            slug: { in: gameSlugs },
            status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
            ...(andClauses.length > 0 && { AND: andClauses }),
          },
          select: { id: true, slug: true },
        });

        const gameBySlug = new Map(games.map((game) => [game.slug, game]));
        const ineligibleSlugs = gameSlugs.filter(
          (slug) => !gameBySlug.has(slug),
        );

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

        await incrementDraftRevision(
          storeId,
          transaction,
          expectedDraftRevision,
        );

        return recommendations.map((recommendation, index) => ({
          ...recommendation,
          position: index + 1,
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    return mapFeaturedConflict(error, storeId, expectedDraftRevision);
  }
}

async function resetSelection(storeId: string, expectedDraftRevision?: number) {
  try {
    await prisma.$transaction(
      async (transaction) => {
        await transaction.storeFeaturedGame.deleteMany({
          where: { store_id: storeId },
        });
        await incrementDraftRevision(
          storeId,
          transaction,
          expectedDraftRevision,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    await mapFeaturedConflict(error, storeId, expectedDraftRevision);
  }
}

async function findAvailableEditorialGames({
  storeId,
  curationWhere,
  priceableGameIds,
  page,
  limit,
}: EditorialGameQuery) {
  const selection = await prisma.storeFeaturedGame.findMany({
    where: { store_id: storeId },
    orderBy: { position: "asc" },
  });

  return findAvailableEditorialGamesFromSelection({
    selection,
    curationWhere,
    priceableGameIds,
    page,
    limit,
  });
}

async function findAvailableEditorialGamesFromSnapshot({
  selection,
  curationWhere,
  priceableGameIds,
  page,
  limit,
}: Omit<EditorialGameQuery, "storeId"> & {
  selection: Array<{
    game_id: string;
    position: number;
    recommendation_reason: string | null;
  }>;
}) {
  return findAvailableEditorialGamesFromSelection({
    selection,
    curationWhere,
    priceableGameIds,
    page,
    limit,
  });
}

async function findAvailableEditorialGamesFromSelection({
  selection,
  curationWhere,
  priceableGameIds,
  page,
  limit,
}: Omit<EditorialGameQuery, "storeId"> & {
  selection: Array<{
    game_id: string;
    position: number;
    recommendation_reason: string | null;
  }>;
}) {
  if (selection.length === 0) {
    return null;
  }

  const andClauses: Prisma.GameWhereInput[] = [];
  if (Object.keys(curationWhere).length > 0) {
    andClauses.push(curationWhere);
  }
  if (priceableGameIds !== null && priceableGameIds !== undefined) {
    // ONLY_DISPLAY titles are intentionally visible without a regional price,
    // matching game.findAllPaginated. ACTIVE titles must be priceable in the
    // visitor's currency.
    andClauses.push({
      OR: [
        { status: "ONLY_DISPLAY" },
        { status: "ACTIVE", id: { in: priceableGameIds } },
      ],
    });
  }

  const games = await prisma.game.findMany({
    where: {
      id: { in: selection.map((entry) => entry.game_id) },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
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
  findAvailableEditorialGamesFromSnapshot,
};

export default storeFeaturedGame;
