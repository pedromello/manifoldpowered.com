import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { NotFoundError } from "infra/errors";
import { z } from "zod";

export const STORE_DRAFT_CATALOG_MODES = [
  "UNDECIDED",
  "ALL",
  "SELECTED",
] as const;
export const STORE_REVISION_CATALOG_MODES = [
  "LEGACY_ALL",
  "ALL",
  "SELECTED",
] as const;

export const storeDraftCatalogModeSchema = z.enum(STORE_DRAFT_CATALOG_MODES);
export const storeRevisionCatalogModeSchema = z.enum(
  STORE_REVISION_CATALOG_MODES,
);

export type StoreDraftCatalogMode = z.infer<typeof storeDraftCatalogModeSchema>;
export type StoreRevisionCatalogModeValue = z.infer<
  typeof storeRevisionCatalogModeSchema
>;

export const storeTagFilterSnapshotSchema = z
  .object({
    tag: z.string().trim().min(1).max(100),
    mode: z.enum(["WHITELIST", "BLACKLIST"]),
  })
  .strict();

export const storeGameOverrideSnapshotSchema = z
  .object({
    game_id: z.string().min(1),
    visibility: z.enum(["SHOW", "HIDE"]),
  })
  .strict();

export const storeCatalogSnapshotSchema = z
  .object({
    catalog_mode: storeRevisionCatalogModeSchema,
    tag_filters: z.array(storeTagFilterSnapshotSchema),
    game_overrides: z.array(storeGameOverrideSnapshotSchema),
  })
  .strict();

export type StoreTagFilterSnapshot = z.infer<
  typeof storeTagFilterSnapshotSchema
>;
export type StoreGameOverrideSnapshot = z.infer<
  typeof storeGameOverrideSnapshotSchema
>;
export type StoreCatalogSnapshot = z.infer<typeof storeCatalogSnapshotSchema>;

export type StoreCatalogClient = Pick<
  Prisma.TransactionClient,
  "store" | "storeTagFilter" | "storeGameOverride" | "$queryRaw"
>;

export function hasIntentionalSelectedCatalog(
  snapshot: Pick<StoreCatalogSnapshot, "tag_filters" | "game_overrides">,
): boolean {
  return (
    snapshot.tag_filters.some((filter) => filter.mode === "WHITELIST") ||
    snapshot.game_overrides.some((override) => override.visibility === "SHOW")
  );
}

export async function getDraftCatalogSnapshot(
  storeId: string,
  client: StoreCatalogClient = prisma,
): Promise<{
  catalog_mode: StoreDraftCatalogMode;
  tag_filters: StoreTagFilterSnapshot[];
  game_overrides: StoreGameOverrideSnapshot[];
}> {
  const [store, filters, overrides] = await Promise.all([
    client.store.findUnique({
      where: { id: storeId },
      select: { catalog_mode: true },
    }),
    client.storeTagFilter.findMany({
      where: { store_id: storeId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { tag: true, mode: true },
    }),
    client.storeGameOverride.findMany({
      where: { store_id: storeId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { game_id: true, visibility: true },
    }),
  ]);

  if (!store) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  return {
    catalog_mode: storeDraftCatalogModeSchema.parse(store.catalog_mode),
    tag_filters: z.array(storeTagFilterSnapshotSchema).parse(filters),
    game_overrides: z.array(storeGameOverrideSnapshotSchema).parse(overrides),
  };
}

/** Build a predicate from the mutable working draft. */
export async function getCurationWhereClause(
  storeId: string,
  client: StoreCatalogClient = prisma,
): Promise<Prisma.GameWhereInput> {
  const draft = await getDraftCatalogSnapshot(storeId, client);

  if (draft.catalog_mode === "UNDECIDED") {
    return { id: { in: [] } };
  }

  return getSnapshotCurationWhereClause(
    { ...draft, catalog_mode: draft.catalog_mode },
    client,
  );
}

/**
 * Build the exact predicate frozen in a publication snapshot. This function is
 * shared by readiness and every public feed, so published behavior cannot drift
 * from the checks that approved it.
 */
export async function getSnapshotCurationWhereClause(
  value: StoreCatalogSnapshot,
  client: StoreCatalogClient = prisma,
): Promise<Prisma.GameWhereInput> {
  const snapshot = storeCatalogSnapshotSchema.parse(value);
  const whitelist = snapshot.tag_filters
    .filter((filter) => filter.mode === "WHITELIST")
    .map((filter) => filter.tag.toLowerCase());
  const blacklist = snapshot.tag_filters
    .filter((filter) => filter.mode === "BLACKLIST")
    .map((filter) => filter.tag.toLowerCase());
  const forceShowIds = snapshot.game_overrides
    .filter((override) => override.visibility === "SHOW")
    .map((override) => override.game_id);
  const forceHideIds = snapshot.game_overrides
    .filter((override) => override.visibility === "HIDE")
    .map((override) => override.game_id);

  if (snapshot.catalog_mode === "LEGACY_ALL") {
    return legacyWhere({
      whitelist,
      blacklist,
      forceShowIds,
      forceHideIds,
      client,
    });
  }

  const casingsByLowerTag =
    whitelist.length > 0 || blacklist.length > 0
      ? await getGameTagCasings(client)
      : new Map<string, string[]>();
  const toGameTagCasings = (lowerTags: string[]) =>
    lowerTags.flatMap((lowerTag) => casingsByLowerTag.get(lowerTag) ?? []);
  const blacklistCasings = toGameTagCasings(blacklist);
  const notHidden: Prisma.GameWhereInput = { id: { notIn: forceHideIds } };

  if (snapshot.catalog_mode === "ALL") {
    if (blacklistCasings.length === 0) {
      return forceHideIds.length === 0 ? {} : notHidden;
    }
    return {
      AND: [
        notHidden,
        {
          OR: [
            { id: { in: forceShowIds } },
            { NOT: { tags: { hasSome: blacklistCasings } } },
          ],
        },
      ],
    };
  }

  const whitelistCasings = toGameTagCasings(whitelist);
  const inclusion: Prisma.GameWhereInput[] = [];
  if (forceShowIds.length > 0) inclusion.push({ id: { in: forceShowIds } });
  if (whitelistCasings.length > 0) {
    inclusion.push({
      AND: [
        { tags: { hasSome: whitelistCasings } },
        ...(blacklistCasings.length > 0
          ? [{ NOT: { tags: { hasSome: blacklistCasings } } }]
          : []),
      ],
    });
  }

  // SELECTED is fail-closed: BLACKLIST-only and empty configurations never
  // degrade into the former implicit whole-catalog behavior.
  if (inclusion.length === 0) return { id: { in: [] } };
  return { AND: [notHidden, { OR: inclusion }] };
}

async function legacyWhere({
  whitelist,
  blacklist,
  forceShowIds,
  forceHideIds,
  client,
}: {
  whitelist: string[];
  blacklist: string[];
  forceShowIds: string[];
  forceHideIds: string[];
  client: StoreCatalogClient;
}): Promise<Prisma.GameWhereInput> {
  if (
    whitelist.length === 0 &&
    blacklist.length === 0 &&
    forceShowIds.length === 0 &&
    forceHideIds.length === 0
  ) {
    return {};
  }

  const tagRuleWhere: Prisma.GameWhereInput = {};
  const casingsByLowerTag = await getGameTagCasings(client);
  const toGameTagCasings = (lowerTags: string[]) =>
    lowerTags.flatMap((lowerTag) => casingsByLowerTag.get(lowerTag) ?? []);

  if (whitelist.length > 0) {
    tagRuleWhere.tags = { hasSome: toGameTagCasings(whitelist) };
  }
  const blacklistCasings = toGameTagCasings(blacklist);
  if (blacklistCasings.length > 0) {
    tagRuleWhere.NOT = { tags: { hasSome: blacklistCasings } };
  }

  return {
    AND: [
      { id: { notIn: forceHideIds } },
      { OR: [{ id: { in: forceShowIds } }, tagRuleWhere] },
    ],
  };
}

async function getGameTagCasings(
  client: StoreCatalogClient,
): Promise<Map<string, string[]>> {
  const rows = await client.$queryRaw<{ tag: string }[]>`
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
