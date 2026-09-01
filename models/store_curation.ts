import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import { Prisma } from "generated/prisma/client";
import gameModel from "models/game";
import { getCurationWhereClause } from "models/store_catalog";

export const TAG_FILTER_MODES = ["WHITELIST", "BLACKLIST"] as const;

export const tagFilterSchema = z.object({
  tag: z.string().min(1).max(100),
  mode: z.enum(TAG_FILTER_MODES),
});

export type TagFilterCreateDto = z.infer<typeof tagFilterSchema>;

export const tagFilterModeSchema = tagFilterSchema.pick({ mode: true });

export const GAME_OVERRIDE_VISIBILITIES = ["SHOW", "HIDE"] as const;

export const gameOverrideSchema = z.object({
  game_slug: z.string().min(1),
  visibility: z.enum(GAME_OVERRIDE_VISIBILITIES),
});

export type GameOverrideCreateDto = z.infer<typeof gameOverrideSchema>;

export const gameOverrideVisibilitySchema = gameOverrideSchema.pick({
  visibility: true,
});

// Tag filters are stored and matched case-insensitively: "RPG" and "rpg" are
// the same filter. We canonicalize to lowercase on write and on every lookup
// so the (store_id, tag) unique constraint dedupes case variants, and resolve
// back to the catalog's actual tag casing at match time (see
// getCurationWhereClause) rather than mutating how game tags are stored.
function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

async function incrementDraftRevision(
  storeId: string,
  transaction: Prisma.TransactionClient,
) {
  await transaction.store.update({
    where: { id: storeId },
    data: { draft_revision: { increment: 1 } },
  });
}

async function addTagFilter(
  storeId: string,
  tag: string,
  mode: (typeof TAG_FILTER_MODES)[number],
) {
  const normalizedTag = normalizeTag(tag);

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const created = await transaction.storeTagFilter.create({
          data: {
            store_id: storeId,
            tag: normalizedTag,
            mode,
          },
        });
        await incrementDraftRevision(storeId, transaction);
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: `Tag "${normalizedTag}" already has a filter configured for this store.`,
        action: "Update the existing filter instead of creating a new one.",
      });
    }
    throw error;
  }
}

async function findOneTagFilterByTag(
  storeId: string,
  tag: string,
  client: Pick<Prisma.TransactionClient, "storeTagFilter"> = prisma,
) {
  const normalizedTag = normalizeTag(tag);

  const filter = await client.storeTagFilter.findUnique({
    where: {
      store_id_tag: {
        store_id: storeId,
        tag: normalizedTag,
      },
    },
  });

  if (!filter) {
    throw new NotFoundError({
      message: `No filter configured for tag "${normalizedTag}" in this store.`,
      action: "Check the tag and try again.",
    });
  }

  return filter;
}

async function updateTagFilterMode(
  storeId: string,
  tag: string,
  mode: (typeof TAG_FILTER_MODES)[number],
) {
  return prisma.$transaction(
    async (transaction) => {
      const filter = await findOneTagFilterByTag(storeId, tag, transaction);
      const updated = await transaction.storeTagFilter.update({
        where: {
          id: filter.id,
        },
        data: {
          mode,
        },
      });
      await incrementDraftRevision(storeId, transaction);
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function removeTagFilter(storeId: string, tag: string) {
  await prisma.$transaction(
    async (transaction) => {
      const filter = await findOneTagFilterByTag(storeId, tag, transaction);
      await transaction.storeTagFilter.delete({
        where: {
          id: filter.id,
        },
      });
      await incrementDraftRevision(storeId, transaction);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function listTagFilters(storeId: string) {
  return await prisma.storeTagFilter.findMany({
    where: {
      store_id: storeId,
    },
    orderBy: {
      created_at: "asc",
    },
  });
}

async function addGameOverride(
  storeId: string,
  gameSlug: string,
  visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number],
) {
  const targetGame = await gameModel.findOneBySlug(gameSlug);

  if (!targetGame) {
    throw new NotFoundError({
      message: `Game with slug "${gameSlug}" was not found.`,
      action: "Check the slug and try again.",
    });
  }

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const created = await transaction.storeGameOverride.create({
          data: {
            store_id: storeId,
            game_id: targetGame.id,
            visibility,
          },
        });
        await incrementDraftRevision(storeId, transaction);
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: `Game "${gameSlug}" already has an override configured for this store.`,
        action: "Update the existing override instead of creating a new one.",
      });
    }
    throw error;
  }
}

async function findOneGameOverrideBySlug(
  storeId: string,
  gameSlug: string,
  client: Pick<Prisma.TransactionClient, "storeGameOverride"> = prisma,
) {
  const targetGame = await gameModel.findOneBySlug(gameSlug);

  if (!targetGame) {
    throw new NotFoundError({
      message: `Game with slug "${gameSlug}" was not found.`,
      action: "Check the slug and try again.",
    });
  }

  const override = await client.storeGameOverride.findUnique({
    where: {
      store_id_game_id: {
        store_id: storeId,
        game_id: targetGame.id,
      },
    },
  });

  if (!override) {
    throw new NotFoundError({
      message: `No override configured for game "${gameSlug}" in this store.`,
      action: "Check the slug and try again.",
    });
  }

  return override;
}

async function updateGameOverrideVisibility(
  storeId: string,
  gameSlug: string,
  visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number],
) {
  return prisma.$transaction(
    async (transaction) => {
      const override = await findOneGameOverrideBySlug(
        storeId,
        gameSlug,
        transaction,
      );
      const updated = await transaction.storeGameOverride.update({
        where: {
          id: override.id,
        },
        data: {
          visibility,
        },
      });
      await incrementDraftRevision(storeId, transaction);
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function removeGameOverride(storeId: string, gameSlug: string) {
  await prisma.$transaction(
    async (transaction) => {
      const override = await findOneGameOverrideBySlug(
        storeId,
        gameSlug,
        transaction,
      );
      await transaction.storeGameOverride.delete({
        where: {
          id: override.id,
        },
      });
      await incrementDraftRevision(storeId, transaction);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function listGameOverridesWithSlugs(storeId: string) {
  const overrides = await prisma.storeGameOverride.findMany({
    where: {
      store_id: storeId,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const gameIds = overrides.map((override) => override.game_id);
  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
    },
    select: {
      id: true,
      slug: true,
    },
  });

  const slugByGameId = games.reduce(
    (acc, gameRow) => {
      acc[gameRow.id] = gameRow.slug;
      return acc;
    },
    {} as Record<string, string>,
  );

  return overrides.map((override) => ({
    ...override,
    game_slug: slugByGameId[override.game_id] || "unknown",
  }));
}

const storeCuration = {
  addTagFilter,
  updateTagFilterMode,
  removeTagFilter,
  listTagFilters,
  addGameOverride,
  updateGameOverrideVisibility,
  removeGameOverride,
  listGameOverridesWithSlugs,
  getCurationWhereClause,
};

export default storeCuration;
