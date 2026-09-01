import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import { Prisma, type StoreRevision } from "generated/prisma/client";
import gameModel from "models/game";

export const TAG_FILTER_MODES = ["WHITELIST", "BLACKLIST"] as const;

export const tagFilterSchema = z.object({
  tag: z.string().min(1).max(100),
  mode: z.enum(TAG_FILTER_MODES),
});

export type TagFilterCreateDto = z.infer<typeof tagFilterSchema>;

export const tagFilterModeSchema = tagFilterSchema.pick({ mode: true });

export const GAME_OVERRIDE_VISIBILITIES = ["SHOW", "HIDE"] as const;

const publishedCurationSchema = z
  .object({
    curation_strategy: z.enum(["NONE", "RULES", "MANUAL", "MIXED"]),
    tag_filters: z.array(
      z
        .object({
          tag: z
            .string()
            .min(1)
            .max(100)
            .refine((tag) => tag === tag.trim().toLowerCase()),
          mode: z.enum(TAG_FILTER_MODES),
        })
        .strict(),
    ),
    game_overrides: z.array(
      z
        .object({
          game_id: z.string().min(1),
          visibility: z.enum(GAME_OVERRIDE_VISIBILITIES),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const tags = snapshot.tag_filters.map(({ tag }) => tag);
    if (new Set(tags).size !== tags.length) {
      context.addIssue({
        code: "custom",
        path: ["tag_filters"],
        message: "Duplicate tags",
      });
    }
    const gameIds = snapshot.game_overrides.map(({ game_id }) => game_id);
    if (new Set(gameIds).size !== gameIds.length) {
      context.addIssue({
        code: "custom",
        path: ["game_overrides"],
        message: "Duplicate game overrides",
      });
    }

    const expectedStrategy =
      snapshot.tag_filters.length > 0 && snapshot.game_overrides.length > 0
        ? "MIXED"
        : snapshot.tag_filters.length > 0
          ? "RULES"
          : snapshot.game_overrides.length > 0
            ? "MANUAL"
            : "NONE";
    if (snapshot.curation_strategy !== expectedStrategy) {
      context.addIssue({
        code: "custom",
        path: ["curation_strategy"],
        message: "Curation strategy does not match its snapshot",
      });
    }
  });

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

async function addTagFilter(
  storeId: string,
  tag: string,
  mode: (typeof TAG_FILTER_MODES)[number],
) {
  const normalizedTag = normalizeTag(tag);

  try {
    return await prisma.$transaction(async (transaction) => {
      const created = await transaction.storeTagFilter.create({
        data: {
          store_id: storeId,
          tag: normalizedTag,
          mode,
        },
      });
      await bumpStoreDraftRevision(transaction, storeId);
      return created;
    });
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

async function findOneTagFilterByTag(storeId: string, tag: string) {
  const normalizedTag = normalizeTag(tag);

  const filter = await prisma.storeTagFilter.findUnique({
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
  const filter = await findOneTagFilterByTag(storeId, tag);

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.storeTagFilter.update({
      where: { id: filter.id },
      data: { mode },
    });
    await bumpStoreDraftRevision(transaction, storeId);
    return updated;
  });
}

async function removeTagFilter(storeId: string, tag: string) {
  const filter = await findOneTagFilterByTag(storeId, tag);

  await prisma.$transaction(async (transaction) => {
    await transaction.storeTagFilter.delete({ where: { id: filter.id } });
    await bumpStoreDraftRevision(transaction, storeId);
  });
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
    return await prisma.$transaction(async (transaction) => {
      const created = await transaction.storeGameOverride.create({
        data: {
          store_id: storeId,
          game_id: targetGame.id,
          visibility,
        },
      });
      await bumpStoreDraftRevision(transaction, storeId);
      return created;
    });
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

async function findOneGameOverrideBySlug(storeId: string, gameSlug: string) {
  const targetGame = await gameModel.findOneBySlug(gameSlug);

  if (!targetGame) {
    throw new NotFoundError({
      message: `Game with slug "${gameSlug}" was not found.`,
      action: "Check the slug and try again.",
    });
  }

  const override = await prisma.storeGameOverride.findUnique({
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
  const override = await findOneGameOverrideBySlug(storeId, gameSlug);

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.storeGameOverride.update({
      where: { id: override.id },
      data: { visibility },
    });
    await bumpStoreDraftRevision(transaction, storeId);
    return updated;
  });
}

async function removeGameOverride(storeId: string, gameSlug: string) {
  const override = await findOneGameOverrideBySlug(storeId, gameSlug);

  await prisma.$transaction(async (transaction) => {
    await transaction.storeGameOverride.delete({ where: { id: override.id } });
    await bumpStoreDraftRevision(transaction, storeId);
  });
}

async function bumpStoreDraftRevision(
  transaction: Prisma.TransactionClient,
  storeId: string,
) {
  const result = await transaction.store.updateMany({
    where: { id: storeId },
    data: { draft_revision: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }
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

async function getCurationWhereClause(
  storeId: string,
  publishedRevision?: StoreRevision,
): Promise<Prisma.GameWhereInput> {
  const publishedCuration = publishedRevision
    ? publishedCurationSchema.parse({
        curation_strategy: publishedRevision.curation_strategy,
        tag_filters: publishedRevision.tag_filters,
        game_overrides: publishedRevision.game_overrides,
      })
    : null;
  const [filters, overrides] = publishedCuration
    ? [publishedCuration.tag_filters, publishedCuration.game_overrides]
    : await Promise.all([
        prisma.storeTagFilter.findMany({ where: { store_id: storeId } }),
        prisma.storeGameOverride.findMany({ where: { store_id: storeId } }),
      ]);

  const whitelist = filters
    .filter((filter) => filter.mode === "WHITELIST")
    .map((filter) => filter.tag.toLowerCase());
  const blacklist = filters
    .filter((filter) => filter.mode === "BLACKLIST")
    .map((filter) => filter.tag.toLowerCase());
  const forceShowIds = overrides
    .filter((override) => override.visibility === "SHOW")
    .map((override) => override.game_id);
  const forceHideIds = overrides
    .filter((override) => override.visibility === "HIDE")
    .map((override) => override.game_id);

  if (
    whitelist.length === 0 &&
    blacklist.length === 0 &&
    forceShowIds.length === 0 &&
    forceHideIds.length === 0
  ) {
    return {};
  }

  // Without tag rules the catalog remains inclusive. Individual SHOW rules
  // are therefore already satisfied, while HIDE rules must still win. Avoid
  // putting an empty object inside Prisma's OR array: Prisma treats that as an
  // empty disjunction, which previously made a single HIDE rule hide every
  // game in the Outlet.
  if (whitelist.length === 0 && blacklist.length === 0) {
    return forceHideIds.length > 0 ? { id: { notIn: forceHideIds } } : {};
  }

  // Overrides always win over tag-based rules: a force-hidden game is excluded
  // even if it matches the whitelist, and a force-shown game is included even
  // if it carries a blacklisted tag or doesn't match the whitelist.
  const tagRuleWhere: Prisma.GameWhereInput = {};

  if (whitelist.length > 0 || blacklist.length > 0) {
    // Filter tags are stored lowercase, but game tags keep their original
    // casing (e.g. "RPG", "Story-Rich"). Resolve each lowercase filter tag to
    // the actual casing(s) present in the catalog so matching is
    // case-insensitive without mutating how game tags are stored. This only
    // runs when a store actually has tag filters configured.
    const casingsByLowerTag = await getGameTagCasings();
    const toGameTagCasings = (lowerTags: string[]) =>
      lowerTags.flatMap((lowerTag) => casingsByLowerTag.get(lowerTag) ?? []);

    if (whitelist.length > 0) {
      // If the whitelist resolves to no catalog casing, hasSome:[] matches no
      // games — the correct result for whitelisting a tag nothing carries.
      tagRuleWhere.tags = { hasSome: toGameTagCasings(whitelist) };
    }

    const blacklistCasings = toGameTagCasings(blacklist);
    if (blacklistCasings.length > 0) {
      tagRuleWhere.NOT = { tags: { hasSome: blacklistCasings } };
    }
  }

  return {
    AND: [
      { id: { notIn: forceHideIds } },
      { OR: [{ id: { in: forceShowIds } }, tagRuleWhere] },
    ],
  };
}

// Returns a map of lowercased tag -> the actual casing(s) that tag appears
// under across the games catalog, from a single DISTINCT unnest query so the
// result stays small regardless of catalog size.
async function getGameTagCasings(): Promise<Map<string, string[]>> {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM games
  `;

  const casingsByLowerTag = new Map<string, string[]>();
  for (const row of rows) {
    const lowerTag = row.tag.toLowerCase();
    const casings = casingsByLowerTag.get(lowerTag) ?? [];
    casings.push(row.tag);
    casingsByLowerTag.set(lowerTag, casings);
  }

  return casingsByLowerTag;
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
