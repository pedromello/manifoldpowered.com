import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import storeCuration from "models/store_curation";
import { z } from "zod";

export const MAX_FEATURED_GAMES = 3;

export const featuredGameSelectionSchema = z
  .object({
    game_slugs: z
      .array(z.string().trim().min(1).max(255))
      .min(1)
      .max(MAX_FEATURED_GAMES),
  })
  .superRefine(({ game_slugs }, context) => {
    if (new Set(game_slugs).size !== game_slugs.length) {
      context.addIssue({
        code: "custom",
        path: ["game_slugs"],
        message: "Featured games must be unique.",
      });
    }
  });

interface EditorialGameQuery {
  storeId: string;
  curationWhere: Prisma.GameWhereInput;
  priceableGameIds?: string[] | null;
  page: number;
  limit: number;
}

async function replaceSelection(storeId: string, gameSlugs: string[]) {
  const curationWhere = await storeCuration.getCurationWhereClause(storeId);

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
      data: gameSlugs.map((slug, index) => ({
        store_id: storeId,
        game_id: gameBySlug.get(slug)!.id,
        position: index + 1,
      })),
    });

    return gameSlugs.map((game_slug, index) => ({
      game_slug,
      position: index + 1,
    }));
  });
}

async function resetSelection(storeId: string) {
  await prisma.storeFeaturedGame.deleteMany({ where: { store_id: storeId } });
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
    .map((entry) => gameById.get(entry.game_id))
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
