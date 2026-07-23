import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import { Prisma } from "generated/prisma/client";
import gameModel from "models/game";

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

async function addTagFilter(
  storeId: string,
  tag: string,
  mode: (typeof TAG_FILTER_MODES)[number],
) {
  const normalizedTag = normalizeTag(tag);

  try {
    return await prisma.storeTagFilter.create({
      data: {
        store_id: storeId,
        tag: normalizedTag,
        mode,
      },
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

  return await prisma.storeTagFilter.update({
    where: {
      id: filter.id,
    },
    data: {
      mode,
    },
  });
}

async function removeTagFilter(storeId: string, tag: string) {
  const filter = await findOneTagFilterByTag(storeId, tag);

  await prisma.storeTagFilter.delete({
    where: {
      id: filter.id,
    },
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
    return await prisma.storeGameOverride.create({
      data: {
        store_id: storeId,
        game_id: targetGame.id,
        visibility,
      },
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

  return await prisma.storeGameOverride.update({
    where: {
      id: override.id,
    },
    data: {
      visibility,
    },
  });
}

async function removeGameOverride(storeId: string, gameSlug: string) {
  const override = await findOneGameOverrideBySlug(storeId, gameSlug);

  await prisma.storeGameOverride.delete({
    where: {
      id: override.id,
    },
  });
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
): Promise<Prisma.GameWhereInput> {
  const [filters, overrides] = await Promise.all([
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
