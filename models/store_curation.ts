import { createHash } from "crypto";
import { prisma } from "infra/database";
import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "infra/errors";
import { Prisma } from "generated/prisma/client";
import gameModel from "models/game";

export const TAG_FILTER_MODES = ["WHITELIST", "BLACKLIST"] as const;

export const tagFilterSchema = z.object({
  tag: z.string().min(1).max(100),
  mode: z.enum(TAG_FILTER_MODES),
  expected_draft_revision: z.number().int().positive().optional(),
});

export type TagFilterCreateDto = z.infer<typeof tagFilterSchema>;

export const tagFilterModeSchema = tagFilterSchema.pick({
  mode: true,
  expected_draft_revision: true,
});

export const expectedRevisionSchema = z.object({
  expected_draft_revision: z.number().int().positive(),
});

export const optionalExpectedRevisionSchema = z.object({
  expected_draft_revision: z.number().int().positive().optional(),
});

export const tagFilterPreviewSchema = z
  .object({
    tag: z.string().min(1).max(100),
    action: z.enum(["UPSERT", "REMOVE"]),
    mode: z.enum(TAG_FILTER_MODES).optional(),
    expected_draft_revision: z.number().int().positive(),
  })
  .refine((data) => data.action === "REMOVE" || data.mode !== undefined, {
    message: "mode is required when previewing an upsert",
    path: ["mode"],
  });

export const GAME_OVERRIDE_VISIBILITIES = ["SHOW", "HIDE"] as const;

export const gameOverrideSchema = z.object({
  game_slug: z.string().min(1),
  visibility: z.enum(GAME_OVERRIDE_VISIBILITIES),
  expected_draft_revision: z.number().int().positive().optional(),
});

export type GameOverrideCreateDto = z.infer<typeof gameOverrideSchema>;

export const gameOverrideVisibilitySchema = gameOverrideSchema.pick({
  visibility: true,
  expected_draft_revision: true,
});

export const bulkCurationPreviewSchema = z.object({
  action: z.enum(["SHOW", "HIDE", "PIN_SHOW"]),
  game_slugs: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
  expected_draft_revision: z.number().int().positive(),
});

export const bulkCurationSchema = z.object({
  operation_id: z.uuid(),
  action: z.enum(["SHOW", "HIDE", "PIN_SHOW"]),
  game_slugs: z
    .array(z.string().trim().min(1).max(255))
    .min(1)
    .max(100)
    .refine((slugs) => new Set(slugs).size === slugs.length, {
      message: "game_slugs must be unique",
    }),
  expected_draft_revision: z.number().int().positive(),
  request_fingerprint: z.string().length(64),
});

export const catalogModeSchema = z.object({
  catalog_mode: z.enum(["ALL", "SELECTED"]),
  expected_draft_revision: z.number().int().positive(),
});

export const tagRuleChangeSchema = tagFilterPreviewSchema;

// Tag filters are stored and matched case-insensitively: "RPG" and "rpg" are
// the same filter. We canonicalize to lowercase on write and on every lookup
// so the (store_id, tag) unique constraint dedupes case variants, and resolve
// back to the catalog's actual tag casing at match time (see
// getCurationWhereClause) rather than mutating how game tags are stored.
function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

type RevisionDatabase = Pick<Prisma.TransactionClient, "store">;

async function resolveDraftRevision(
  database: RevisionDatabase,
  storeId: string,
  expectedDraftRevision?: number,
) {
  const store = await database.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { draft_revision: true },
  });
  if (
    expectedDraftRevision !== undefined &&
    store.draft_revision !== expectedDraftRevision
  ) {
    throw new ConflictError({
      context: {
        expected_draft_revision: expectedDraftRevision,
        actual_draft_revision: store.draft_revision,
      },
    });
  }
  return store.draft_revision;
}

async function assertDraftRevision(
  database: RevisionDatabase,
  storeId: string,
  expectedDraftRevision: number,
) {
  return resolveDraftRevision(database, storeId, expectedDraftRevision);
}

async function incrementDraftRevision(
  database: RevisionDatabase,
  storeId: string,
  expectedDraftRevision: number,
) {
  const updated = await database.store.updateMany({
    where: { id: storeId, draft_revision: expectedDraftRevision },
    data: { draft_revision: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new ConflictError({
      message: "The Outlet draft changed before the curation update completed.",
      action: "Refresh the Outlet and try the curation update again.",
      context: { expected_draft_revision: expectedDraftRevision },
    });
  }
  return expectedDraftRevision + 1;
}

function curationFingerprint(input: {
  action: "SHOW" | "HIDE" | "PIN_SHOW";
  game_slugs: string[];
  expected_draft_revision: number;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action: input.action,
        game_slugs: [...input.game_slugs].sort(),
        expected_draft_revision: input.expected_draft_revision,
      }),
    )
    .digest("hex");
}

async function addTagFilter(
  storeId: string,
  tag: string,
  mode: (typeof TAG_FILTER_MODES)[number],
  expectedDraftRevision?: number,
) {
  const normalizedTag = normalizeTag(tag);

  try {
    return await prisma.$transaction(async (transaction) => {
      const resolvedDraftRevision = await resolveDraftRevision(
        transaction,
        storeId,
        expectedDraftRevision,
      );
      const filter = await transaction.storeTagFilter.create({
        data: { store_id: storeId, tag: normalizedTag, mode },
      });
      await incrementDraftRevision(transaction, storeId, resolvedDraftRevision);
      return filter;
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

async function updateTagFilterMode(
  storeId: string,
  tag: string,
  mode: (typeof TAG_FILTER_MODES)[number],
  expectedDraftRevision?: number,
) {
  return prisma.$transaction(async (transaction) => {
    const resolvedDraftRevision = await resolveDraftRevision(
      transaction,
      storeId,
      expectedDraftRevision,
    );
    const filter = await transaction.storeTagFilter.findUnique({
      where: { store_id_tag: { store_id: storeId, tag: normalizeTag(tag) } },
    });
    if (!filter)
      throw new NotFoundError({ message: "Tag rule was not found." });
    const updated = await transaction.storeTagFilter.update({
      where: { id: filter.id },
      data: { mode },
    });
    await incrementDraftRevision(transaction, storeId, resolvedDraftRevision);
    return updated;
  });
}

async function removeTagFilter(
  storeId: string,
  tag: string,
  expectedDraftRevision?: number,
) {
  await prisma.$transaction(async (transaction) => {
    const resolvedDraftRevision = await resolveDraftRevision(
      transaction,
      storeId,
      expectedDraftRevision,
    );
    const filter = await transaction.storeTagFilter.findUnique({
      where: { store_id_tag: { store_id: storeId, tag: normalizeTag(tag) } },
    });
    if (!filter)
      throw new NotFoundError({ message: "Tag rule was not found." });
    await transaction.storeTagFilter.delete({ where: { id: filter.id } });
    await incrementDraftRevision(transaction, storeId, resolvedDraftRevision);
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
  expectedDraftRevision?: number,
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
      const resolvedDraftRevision = await resolveDraftRevision(
        transaction,
        storeId,
        expectedDraftRevision,
      );
      const override = await transaction.storeGameOverride.create({
        data: { store_id: storeId, game_id: targetGame.id, visibility },
      });
      await incrementDraftRevision(transaction, storeId, resolvedDraftRevision);
      return override;
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

async function updateGameOverrideVisibility(
  storeId: string,
  gameSlug: string,
  visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number],
  expectedDraftRevision?: number,
) {
  const targetGame = await gameModel.findOneBySlug(gameSlug);
  if (!targetGame) throw new NotFoundError({ message: "Game was not found." });
  return prisma.$transaction(async (transaction) => {
    const resolvedDraftRevision = await resolveDraftRevision(
      transaction,
      storeId,
      expectedDraftRevision,
    );
    const override = await transaction.storeGameOverride.findUnique({
      where: {
        store_id_game_id: { store_id: storeId, game_id: targetGame.id },
      },
    });
    if (!override)
      throw new NotFoundError({ message: "Override was not found." });
    const updated = await transaction.storeGameOverride.update({
      where: { id: override.id },
      data: { visibility },
    });
    await incrementDraftRevision(transaction, storeId, resolvedDraftRevision);
    return updated;
  });
}

async function removeGameOverride(
  storeId: string,
  gameSlug: string,
  expectedDraftRevision?: number,
) {
  const targetGame = await gameModel.findOneBySlug(gameSlug);
  if (!targetGame) throw new NotFoundError({ message: "Game was not found." });
  await prisma.$transaction(async (transaction) => {
    const resolvedDraftRevision = await resolveDraftRevision(
      transaction,
      storeId,
      expectedDraftRevision,
    );
    const override = await transaction.storeGameOverride.findUnique({
      where: {
        store_id_game_id: { store_id: storeId, game_id: targetGame.id },
      },
    });
    if (!override)
      throw new NotFoundError({ message: "Override was not found." });
    await transaction.storeGameOverride.delete({ where: { id: override.id } });
    await incrementDraftRevision(transaction, storeId, resolvedDraftRevision);
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

type TagRule = {
  tag: string;
  mode: (typeof TAG_FILTER_MODES)[number];
};

type GameVisibilityOverride = {
  id?: string;
  game_id: string;
  visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number];
  updated_at?: Date;
};

export type CatalogMode = "UNDECIDED" | "ALL" | "SELECTED";

export type CurationSnapshot = {
  catalog_mode: CatalogMode;
  draft_revision: number;
  tag_filters: TagRule[];
  game_overrides: Array<{
    game_id: string;
    visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number];
  }>;
};

type CurationDatabase = Pick<
  Prisma.TransactionClient,
  "store" | "storeTagFilter" | "storeGameOverride"
>;

export async function curationSnapshotForStore(
  database: CurationDatabase,
  storeId: string,
): Promise<CurationSnapshot> {
  const [store, filters, overrides] = await Promise.all([
    database.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { catalog_mode: true, draft_revision: true },
    }),
    database.storeTagFilter.findMany({
      where: { store_id: storeId },
      select: { tag: true, mode: true },
    }),
    database.storeGameOverride.findMany({
      where: { store_id: storeId },
      select: { game_id: true, visibility: true },
    }),
  ]);

  return {
    catalog_mode: store.catalog_mode,
    draft_revision: store.draft_revision,
    tag_filters: filters,
    game_overrides: overrides,
  };
}

function buildCurationWhereClause(
  catalogMode: CatalogMode,
  filters: TagRule[],
  overrides: GameVisibilityOverride[],
  casingsByLowerTag: Map<string, string[]>,
): Prisma.GameWhereInput {
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

  const toGameTagCasings = (lowerTags: string[]) =>
    lowerTags.flatMap((lowerTag) => casingsByLowerTag.get(lowerTag) ?? []);
  const blacklistCasings = toGameTagCasings(blacklist);
  const whitelistCasings = toGameTagCasings(whitelist);
  // ALL is broad by design: whitelist rules remain configured but dormant.
  // SELECTED/UNDECIDED fail closed until a whitelist or explicit SHOW exists.
  const ruleWhere: Prisma.GameWhereInput =
    catalogMode === "ALL"
      ? blacklistCasings.length > 0
        ? { NOT: { tags: { hasSome: blacklistCasings } } }
        : {}
      : whitelist.length > 0
        ? {
            tags: { hasSome: whitelistCasings },
            ...(blacklistCasings.length > 0 && {
              NOT: { tags: { hasSome: blacklistCasings } },
            }),
          }
        : { id: { in: [] } };

  if (catalogMode === "ALL" && blacklistCasings.length === 0) {
    return forceHideIds.length > 0 ? { id: { notIn: forceHideIds } } : {};
  }

  return {
    AND: [
      { id: { notIn: forceHideIds } },
      // SHOW bypasses blacklist; the outer HIDE guard always wins.
      { OR: [{ id: { in: forceShowIds } }, ruleWhere] },
    ],
  };
}

async function getCurationWhereClause(
  storeId: string,
  catalogModeOverride?: Exclude<CatalogMode, "UNDECIDED">,
): Promise<Prisma.GameWhereInput> {
  const [store, filters, overrides] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { catalog_mode: true, draft_revision: true },
    }),
    prisma.storeTagFilter.findMany({ where: { store_id: storeId } }),
    prisma.storeGameOverride.findMany({ where: { store_id: storeId } }),
  ]);

  const casingsByLowerTag =
    filters.length > 0 ? await getGameTagCasings() : new Map();
  return buildCurationWhereClause(
    catalogModeOverride ?? store.catalog_mode,
    filters,
    overrides,
    casingsByLowerTag,
  );
}

async function previewTagFilterImpact(
  storeId: string,
  input: z.infer<typeof tagFilterPreviewSchema>,
  priceableGameIds?: string[] | null,
) {
  const [store, filters, overrides] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { catalog_mode: true, draft_revision: true },
    }),
    prisma.storeTagFilter.findMany({ where: { store_id: storeId } }),
    prisma.storeGameOverride.findMany({ where: { store_id: storeId } }),
  ]);
  if (store.draft_revision !== input.expected_draft_revision) {
    throw new ConflictError({
      context: {
        expected_draft_revision: input.expected_draft_revision,
        actual_draft_revision: store.draft_revision,
      },
    });
  }
  const targetTag = normalizeTag(input.tag);
  const nextFilters: TagRule[] = filters
    .filter((filter) => normalizeTag(filter.tag) !== targetTag)
    .map(({ tag, mode }) => ({ tag, mode }));
  if (input.action === "UPSERT") {
    nextFilters.push({
      tag: targetTag,
      mode: input.mode!,
    });
  }

  const casingsByLowerTag = await getGameTagCasings();
  const currentWhere = buildCurationWhereClause(
    store.catalog_mode,
    filters,
    overrides,
    casingsByLowerTag,
  );
  const resultWhere = buildCurationWhereClause(
    store.catalog_mode,
    nextFilters,
    overrides,
    casingsByLowerTag,
  );
  const pricingWhere: Prisma.GameWhereInput | null =
    priceableGameIds === null || priceableGameIds === undefined
      ? null
      : {
          OR: [
            { status: "ONLY_DISPLAY" },
            { status: "ACTIVE", id: { in: priceableGameIds } },
          ],
        };

  const idsFor = async (curationWhere: Prisma.GameWhereInput) => {
    const andClauses: Prisma.GameWhereInput[] = [];
    if (Object.keys(curationWhere).length > 0) andClauses.push(curationWhere);
    if (pricingWhere) andClauses.push(pricingWhere);
    return prisma.game.findMany({
      where: {
        status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
        ...(andClauses.length > 0 && { AND: andClauses }),
      },
      select: { id: true },
    });
  };

  const [currentGames, resultGames] = await Promise.all([
    idsFor(currentWhere),
    idsFor(resultWhere),
  ]);
  const currentIds = new Set(currentGames.map((game) => game.id));
  const resultIds = new Set(resultGames.map((game) => game.id));

  return {
    draft_revision: store.draft_revision,
    current_count: currentIds.size,
    result_count: resultIds.size,
    shown_count: [...resultIds].filter((id) => !currentIds.has(id)).length,
    hidden_count: [...currentIds].filter((id) => !resultIds.has(id)).length,
    unchanged_count: [...resultIds].filter((id) => currentIds.has(id)).length,
  };
}

export async function setCatalogMode(
  storeId: string,
  input: z.infer<typeof catalogModeSchema>,
) {
  return prisma.$transaction(async (transaction) => {
    await assertDraftRevision(
      transaction,
      storeId,
      input.expected_draft_revision,
    );
    await transaction.store.update({
      where: { id: storeId },
      data: { catalog_mode: input.catalog_mode },
    });
    const draftRevision = await incrementDraftRevision(
      transaction,
      storeId,
      input.expected_draft_revision,
    );
    return { catalog_mode: input.catalog_mode, draft_revision: draftRevision };
  });
}

export async function applyTagRuleChange(
  storeId: string,
  input: z.infer<typeof tagRuleChangeSchema>,
) {
  return prisma.$transaction(async (transaction) => {
    await assertDraftRevision(
      transaction,
      storeId,
      input.expected_draft_revision,
    );
    const tag = normalizeTag(input.tag);
    const previous = await transaction.storeTagFilter.findUnique({
      where: { store_id_tag: { store_id: storeId, tag } },
    });
    const appliedMode = input.action === "UPSERT" ? input.mode! : null;
    if ((previous?.mode ?? null) === appliedMode) {
      return {
        change_id: null,
        changed: false,
        draft_revision: input.expected_draft_revision,
      };
    }
    if (appliedMode) {
      await transaction.storeTagFilter.upsert({
        where: { store_id_tag: { store_id: storeId, tag } },
        create: { store_id: storeId, tag, mode: appliedMode },
        update: { mode: appliedMode },
      });
    } else if (previous) {
      await transaction.storeTagFilter.delete({ where: { id: previous.id } });
    }
    const draftRevision = await incrementDraftRevision(
      transaction,
      storeId,
      input.expected_draft_revision,
    );
    const change = await transaction.storeTagRuleChange.create({
      data: {
        store_id: storeId,
        tag,
        previous_mode: previous?.mode ?? null,
        applied_mode: appliedMode,
        base_draft_revision: input.expected_draft_revision,
        result_draft_revision: draftRevision,
      },
    });
    return {
      change_id: change.id,
      changed: true,
      draft_revision: draftRevision,
    };
  });
}

export async function undoTagRuleChange(
  storeId: string,
  changeId: string,
  expectedDraftRevision: number,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const change = await transaction.storeTagRuleChange.findFirst({
          where: { id: changeId, store_id: storeId },
        });
        if (!change)
          throw new NotFoundError({ message: "Tag change was not found." });
        if (change.undone_at) {
          return {
            already_undone: true,
            draft_revision: await resolveDraftRevision(transaction, storeId),
          };
        }

        await assertDraftRevision(transaction, storeId, expectedDraftRevision);
        if (change.result_draft_revision !== expectedDraftRevision) {
          throw new ConflictError({
            message: "This tag change can no longer be safely undone.",
            action: "Review the current rules before changing them again.",
          });
        }
        const current = await transaction.storeTagFilter.findUnique({
          where: { store_id_tag: { store_id: storeId, tag: change.tag } },
        });
        if ((current?.mode ?? null) !== change.applied_mode) {
          throw new ConflictError({
            message: "The tag rule changed after this operation.",
          });
        }
        if (change.previous_mode) {
          await transaction.storeTagFilter.upsert({
            where: { store_id_tag: { store_id: storeId, tag: change.tag } },
            create: {
              store_id: storeId,
              tag: change.tag,
              mode: change.previous_mode,
            },
            update: { mode: change.previous_mode },
          });
        } else if (current) {
          await transaction.storeTagFilter.delete({
            where: { id: current.id },
          });
        }
        await transaction.storeTagRuleChange.update({
          where: { id: change.id },
          data: { undone_at: new Date() },
        });
        return {
          already_undone: false,
          draft_revision: await incrementDraftRevision(
            transaction,
            storeId,
            expectedDraftRevision,
          ),
        };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    const completed = await prisma.storeTagRuleChange.findFirst({
      where: { id: changeId, store_id: storeId, undone_at: { not: null } },
    });
    if (completed) {
      return {
        already_undone: true,
        draft_revision: await resolveDraftRevision(prisma, storeId),
      };
    }
    throw error;
  }
}

export async function getCurationManagementState(
  storeId: string,
  candidateGameIds: string[],
) {
  const [store, filters, overrides, featured, sales] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { catalog_mode: true, draft_revision: true },
    }),
    prisma.storeTagFilter.findMany({ where: { store_id: storeId } }),
    prisma.storeGameOverride.findMany({ where: { store_id: storeId } }),
    prisma.storeFeaturedGame.findMany({
      where: { store_id: storeId },
      orderBy: { position: "asc" },
    }),
    prisma.sale.groupBy({
      by: ["game_id"],
      where: {
        store_id: storeId,
        game_id: { in: candidateGameIds },
      },
      _count: { _all: true },
    }),
  ]);
  const casingsByLowerTag =
    filters.length > 0 ? await getGameTagCasings() : new Map();
  const curationWhere = buildCurationWhereClause(
    store.catalog_mode,
    filters,
    overrides,
    casingsByLowerTag,
  );
  const visibleGames = await prisma.game.findMany({
    where: {
      id: { in: candidateGameIds },
      ...(Object.keys(curationWhere).length > 0 && { AND: [curationWhere] }),
    },
    select: { id: true },
  });

  return {
    catalog_mode: store.catalog_mode,
    draft_revision: store.draft_revision,
    visible_ids: new Set(visibleGames.map((game) => game.id)),
    overrides_by_game_id: new Map(
      overrides.map((override) => [override.game_id, override]),
    ),
    featured_by_game_id: new Map(
      featured.map((entry) => [entry.game_id, entry]),
    ),
    sales_by_game_id: new Map(
      sales.map((entry) => [entry.game_id, entry._count._all]),
    ),
  };
}

type BulkCurationChange = {
  game_id: string;
  game_slug: string;
  previous: {
    visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number];
    updated_at: string;
  } | null;
  applied: {
    visibility: (typeof GAME_OVERRIDE_VISIBILITIES)[number];
    updated_at: string;
  };
};

function batchChanges(value: Prisma.JsonValue): BulkCurationChange[] {
  return value as unknown as BulkCurationChange[];
}

function bulkReplayResponse(
  batch: {
    id: string;
    request_fingerprint: string;
    result_draft_revision: number;
    changes: Prisma.JsonValue;
    undone_at: Date | null;
  },
  input: z.infer<typeof bulkCurationSchema>,
  expectedFingerprint: string,
) {
  if (batch.request_fingerprint !== expectedFingerprint) {
    throw new ConflictError({
      message: "This operation id was already used for another request.",
      action: "Create a new operation after reviewing the selection.",
    });
  }
  const changes = batchChanges(batch.changes);
  return {
    batch_id: batch.id,
    changed_count: changes.length,
    unchanged_count: input.game_slugs.length - changes.length,
    undo_available: changes.length > 0 && !batch.undone_at,
    replayed: true,
    draft_revision: batch.result_draft_revision,
  };
}

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function previewBulkCuration(
  storeId: string,
  input: z.infer<typeof bulkCurationPreviewSchema>,
) {
  await assertDraftRevision(prisma, storeId, input.expected_draft_revision);
  const games = await prisma.game.findMany({
    where: {
      slug: { in: input.game_slugs },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
    },
    select: { id: true, slug: true },
  });
  if (games.length !== input.game_slugs.length) {
    throw new ValidationError({
      message: "One or more games are unavailable for curation.",
      action: "Refresh the catalog and try again.",
    });
  }
  const state = await getCurationManagementState(
    storeId,
    games.map((game) => game.id),
  );
  const changed = games.filter((game) => {
    const override = state.overrides_by_game_id.get(game.id);
    if (input.action === "PIN_SHOW") return override?.visibility !== "SHOW";
    return input.action === "SHOW"
      ? !state.visible_ids.has(game.id)
      : state.visible_ids.has(game.id);
  });
  return {
    draft_revision: input.expected_draft_revision,
    request_fingerprint: curationFingerprint(input),
    changed_count: changed.length,
    unchanged_count: games.length - changed.length,
  };
}

export async function applyBulkCuration(
  storeId: string,
  input: z.infer<typeof bulkCurationSchema>,
) {
  const expectedFingerprint = curationFingerprint(input);
  if (input.request_fingerprint !== expectedFingerprint) {
    throw new ValidationError({
      message: "The bulk request does not match its preview.",
      action: "Preview the selection again before applying it.",
    });
  }
  const casingsByLowerTag = await getGameTagCasings();

  const execute = () =>
    prisma.$transaction(
      async (transaction) => {
        const existingBatch = await transaction.storeCurationBatch.findUnique({
          where: {
            store_id_operation_id: {
              store_id: storeId,
              operation_id: input.operation_id,
            },
          },
        });
        if (existingBatch) {
          return bulkReplayResponse(existingBatch, input, expectedFingerprint);
        }

        const [store, filters, overrides, games] = await Promise.all([
          transaction.store.findUniqueOrThrow({ where: { id: storeId } }),
          transaction.storeTagFilter.findMany({
            where: { store_id: storeId },
          }),
          transaction.storeGameOverride.findMany({
            where: { store_id: storeId },
          }),
          transaction.game.findMany({
            where: {
              slug: { in: input.game_slugs },
              status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
            },
          }),
        ]);
        if (store.draft_revision !== input.expected_draft_revision) {
          throw new ConflictError({
            context: {
              expected_draft_revision: input.expected_draft_revision,
              actual_draft_revision: store.draft_revision,
            },
          });
        }

        if (games.length !== input.game_slugs.length) {
          const foundSlugs = new Set(games.map((game) => game.slug));
          throw new ValidationError({
            message: "One or more games are unavailable for curation.",
            action: "Refresh the catalog and try again.",
            context: {
              game_slugs: input.game_slugs.filter(
                (slug) => !foundSlugs.has(slug),
              ),
            },
          });
        }

        const curationWhere = buildCurationWhereClause(
          store.catalog_mode,
          filters,
          overrides,
          casingsByLowerTag,
        );
        const visibleGames = await transaction.game.findMany({
          where: {
            slug: { in: input.game_slugs },
            status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
            ...(Object.keys(curationWhere).length > 0 && {
              AND: [curationWhere],
            }),
          },
          select: { id: true },
        });
        const visibleIds = new Set(visibleGames.map((game) => game.id));
        const overrideByGameId = new Map(
          overrides.map((override) => [override.game_id, override]),
        );
        const gameBySlug = new Map(games.map((game) => [game.slug, game]));
        const changes: BulkCurationChange[] = [];

        for (const gameSlug of input.game_slugs) {
          const game = gameBySlug.get(gameSlug)!;
          const currentVisible = visibleIds.has(game.id);
          const previous = overrideByGameId.get(game.id) ?? null;
          const shouldChange =
            input.action === "PIN_SHOW"
              ? previous?.visibility !== "SHOW"
              : input.action === "SHOW"
                ? !currentVisible
                : currentVisible;
          if (!shouldChange) continue;

          const targetVisibility = input.action === "HIDE" ? "HIDE" : "SHOW";
          const applied = await transaction.storeGameOverride.upsert({
            where: {
              store_id_game_id: { store_id: storeId, game_id: game.id },
            },
            create: {
              store_id: storeId,
              game_id: game.id,
              visibility: targetVisibility,
            },
            update: { visibility: targetVisibility },
          });
          changes.push({
            game_id: game.id,
            game_slug: game.slug,
            previous: previous
              ? {
                  visibility: previous.visibility,
                  updated_at: previous.updated_at.toISOString(),
                }
              : null,
            applied: {
              visibility: applied.visibility,
              updated_at: applied.updated_at.toISOString(),
            },
          });
        }

        const resultDraftRevision = await incrementDraftRevision(
          transaction,
          storeId,
          input.expected_draft_revision,
        );
        const batch = await transaction.storeCurationBatch.create({
          data: {
            store_id: storeId,
            operation_id: input.operation_id,
            request_fingerprint: expectedFingerprint,
            base_draft_revision: input.expected_draft_revision,
            result_draft_revision: resultDraftRevision,
            action: input.action,
            changes: changes as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          batch_id: batch.id,
          changed_count: changes.length,
          unchanged_count: input.game_slugs.length - changes.length,
          undo_available: changes.length > 0,
          replayed: false,
          draft_revision: resultDraftRevision,
        };
      },
      { isolationLevel: "Serializable" },
    );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      const existingBatch = await prisma.storeCurationBatch.findUnique({
        where: {
          store_id_operation_id: {
            store_id: storeId,
            operation_id: input.operation_id,
          },
        },
      });
      if (existingBatch) {
        return bulkReplayResponse(existingBatch, input, expectedFingerprint);
      }
      if (isRetryableTransactionError(error) && attempt < 2) continue;
      if (isRetryableTransactionError(error)) {
        throw new ConflictError({
          message: "The Outlet draft changed during the bulk update.",
          action: "Refresh the catalog and preview the selection again.",
        });
      }
      throw error;
    }
  }

  throw new ConflictError({});
}

export async function undoBulkCuration(
  storeId: string,
  batchId: string,
  expectedDraftRevision: number,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const batch = await transaction.storeCurationBatch.findFirst({
          where: { id: batchId, store_id: storeId },
        });
        if (!batch) {
          throw new NotFoundError({
            message: "Curation change was not found.",
            action: "Refresh the catalog and try again.",
          });
        }
        if (batch.undone_at) {
          return {
            batch_id: batch.id,
            undone_count: 0,
            already_undone: true,
            draft_revision: await resolveDraftRevision(transaction, storeId),
          };
        }

        await assertDraftRevision(transaction, storeId, expectedDraftRevision);

        const changes = batchChanges(batch.changes);
        const currentOverrides = await transaction.storeGameOverride.findMany({
          where: {
            store_id: storeId,
            game_id: { in: changes.map((change) => change.game_id) },
          },
        });
        const currentByGameId = new Map(
          currentOverrides.map((override) => [override.game_id, override]),
        );

        const conflicted = changes.filter((change) => {
          const current = currentByGameId.get(change.game_id);
          return (
            !current ||
            current.visibility !== change.applied.visibility ||
            current.updated_at.toISOString() !== change.applied.updated_at
          );
        });
        if (conflicted.length > 0) {
          throw new ValidationError({
            message:
              "This change can no longer be safely undone because the catalog changed again.",
            action: "Review the current catalog before making another change.",
            context: {
              game_slugs: conflicted.map((change) => change.game_slug),
            },
          });
        }

        for (const change of changes) {
          const current = currentByGameId.get(change.game_id)!;
          if (change.previous) {
            await transaction.storeGameOverride.update({
              where: { id: current.id },
              data: { visibility: change.previous.visibility },
            });
          } else {
            await transaction.storeGameOverride.delete({
              where: { id: current.id },
            });
          }
        }
        await transaction.storeCurationBatch.update({
          where: { id: batch.id },
          data: { undone_at: new Date() },
        });
        const resultDraftRevision = await incrementDraftRevision(
          transaction,
          storeId,
          expectedDraftRevision,
        );

        return {
          batch_id: batch.id,
          undone_count: changes.length,
          already_undone: false,
          draft_revision: resultDraftRevision,
        };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    const completed = await prisma.storeCurationBatch.findFirst({
      where: { id: batchId, store_id: storeId, undone_at: { not: null } },
    });
    if (completed) {
      return {
        batch_id: completed.id,
        undone_count: 0,
        already_undone: true,
        draft_revision: await resolveDraftRevision(prisma, storeId),
      };
    }
    throw error;
  }
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
  previewTagFilterImpact,
  previewBulkCuration,
  applyBulkCuration,
  undoBulkCuration,
  setCatalogMode,
  applyTagRuleChange,
  undoTagRuleChange,
  getCurationManagementState,
};

export default storeCuration;
