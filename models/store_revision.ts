import type { Prisma, Store, StoreRevision } from "generated/prisma/client";
import { prisma } from "infra/database";
import { NotFoundError } from "infra/errors";
import {
  getDraftCatalogSnapshot,
  getSnapshotCurationWhereClause,
  hasIntentionalSelectedCatalog,
  storeCatalogSnapshotSchema,
  type StoreCatalogSnapshot,
  type StoreDraftCatalogMode,
} from "models/store_catalog";
import {
  parseStorePresentationForSlug,
  resolveDraftPresentation,
  type StorePresentation,
} from "models/store_presentation";
import { z } from "zod";

export const STORE_READINESS_VERSION = 2 as const;
export const STORE_MINIMUM_CATALOG_GAMES = 5 as const;
export const STORE_MINIMUM_FEATURED_GAMES = 1 as const;
export const STORE_MAXIMUM_FEATURED_GAMES = 3 as const;

export const storeFeaturedSnapshotEntrySchema = z
  .object({
    game_id: z.string().min(1),
    position: z.number().int().min(1).max(STORE_MAXIMUM_FEATURED_GAMES),
    recommendation_reason: z.string().max(240).nullable(),
  })
  .strict();

export type StoreFeaturedSnapshotEntry = z.infer<
  typeof storeFeaturedSnapshotEntrySchema
>;

export const STORE_READINESS_BLOCKER_CODES = [
  "BRAND_INCOMPLETE",
  "CATALOG_MODE_UNDECIDED",
  "SELECTED_CATALOG_WITHOUT_INCLUSIONS",
  "CATALOG_TOO_SMALL",
  "FEATURED_COUNT_INVALID",
  "FEATURED_OUTSIDE_CATALOG",
  "FEATURED_REASON_MISSING",
] as const;

export type StoreReadinessBlockerCode =
  (typeof STORE_READINESS_BLOCKER_CODES)[number];

export interface StoreReadinessBlocker {
  code: StoreReadinessBlockerCode;
  message: string;
  details?:
    | { minimum: number; actual: number }
    | { minimum: number; maximum: number; actual: number }
    | { game_ids: string[] };
}

export interface StorePublicationReadinessV2 {
  version: typeof STORE_READINESS_VERSION;
  ready: boolean;
  catalog_game_count: number;
  checks: {
    brand_complete: boolean;
    catalog_intentional: boolean;
    catalog_has_games: boolean;
    editorial_highlight: boolean;
  };
  blockers: StoreReadinessBlocker[];
}

type StoreRevisionClient = Pick<
  Prisma.TransactionClient,
  | "store"
  | "storeTagFilter"
  | "storeGameOverride"
  | "storeFeaturedGame"
  | "storeRevision"
  | "game"
  | "$queryRaw"
>;

export interface StoreDraftSnapshot {
  store: Store;
  catalog_mode: Exclude<StoreDraftCatalogMode, "UNDECIDED">;
  catalog: StoreCatalogSnapshot;
  featured_games: StoreFeaturedSnapshotEntry[];
  presentation: StorePresentation;
}

export interface ParsedStoreRevision {
  id: string;
  store_id: string;
  revision: number;
  source_draft_revision: number;
  actor_user_id: string;
  catalog: StoreCatalogSnapshot;
  name: string;
  description: string | null;
  logo_url: string | null;
  featured_games: StoreFeaturedSnapshotEntry[];
  presentation: StorePresentation;
  created_at: Date;
}

export function parseStoreRevision(
  revision: StoreRevision,
  storeSlug: string,
): ParsedStoreRevision {
  return {
    id: revision.id,
    store_id: revision.store_id,
    revision: revision.revision,
    source_draft_revision: revision.source_draft_revision,
    actor_user_id: revision.actor_user_id,
    catalog: storeCatalogSnapshotSchema.parse({
      catalog_mode: revision.catalog_mode,
      tag_filters: revision.tag_filters,
      game_overrides: revision.game_overrides,
    }),
    name: revision.name,
    description: revision.description,
    logo_url: revision.logo_url,
    featured_games: z
      .array(storeFeaturedSnapshotEntrySchema)
      .parse(revision.featured_games),
    presentation: parseStorePresentationForSlug(
      storeSlug,
      revision.presentation,
    ),
    created_at: revision.created_at,
  };
}

function isBrandComplete(
  store: Pick<Store, "description" | "logo_url">,
): boolean {
  return Boolean(store.description?.trim() && store.logo_url?.trim());
}

async function assessDraft(
  storeId: string,
  client: StoreRevisionClient,
): Promise<{
  readiness: StorePublicationReadinessV2;
  draft: StoreDraftSnapshot | null;
}> {
  const [store, draftCatalog, featuredRows] = await Promise.all([
    client.store.findUnique({ where: { id: storeId } }),
    getDraftCatalogSnapshot(storeId, client),
    client.storeFeaturedGame.findMany({
      where: { store_id: storeId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: {
        game_id: true,
        position: true,
        recommendation_reason: true,
      },
    }),
  ]);

  if (!store) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  const blockers: StoreReadinessBlocker[] = [];
  const brandComplete = isBrandComplete(store);
  if (!brandComplete) {
    blockers.push({
      code: "BRAND_INCOMPLETE",
      message: "Add a non-empty description and logo before publishing.",
    });
  }

  const catalogModeSelected = draftCatalog.catalog_mode !== "UNDECIDED";
  const selectedHasInclusions = hasIntentionalSelectedCatalog({
    tag_filters: draftCatalog.tag_filters,
    game_overrides: draftCatalog.game_overrides,
  });
  const catalogIntentional =
    catalogModeSelected &&
    (draftCatalog.catalog_mode === "ALL" || selectedHasInclusions);

  if (!catalogModeSelected) {
    blockers.push({
      code: "CATALOG_MODE_UNDECIDED",
      message: "Choose ALL or SELECTED for the Outlet catalog.",
    });
  } else if (!catalogIntentional) {
    blockers.push({
      code: "SELECTED_CATALOG_WITHOUT_INCLUSIONS",
      message:
        "A SELECTED catalog needs at least one SHOW override or WHITELIST filter.",
    });
  }

  const publishableCatalog: StoreCatalogSnapshot | null = catalogModeSelected
    ? storeCatalogSnapshotSchema.parse({
        ...draftCatalog,
        catalog_mode: draftCatalog.catalog_mode,
      })
    : null;
  const curationWhere =
    publishableCatalog && catalogIntentional
      ? await getSnapshotCurationWhereClause(publishableCatalog, client)
      : { id: { in: [] as string[] } };
  const catalogGameCount = await client.game.count({
    where: {
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      AND: [curationWhere],
    },
  });
  const catalogHasGames =
    catalogIntentional && catalogGameCount >= STORE_MINIMUM_CATALOG_GAMES;
  if (!catalogHasGames) {
    blockers.push({
      code: "CATALOG_TOO_SMALL",
      message: `The published catalog must contain at least ${STORE_MINIMUM_CATALOG_GAMES} eligible games.`,
      details: {
        minimum: STORE_MINIMUM_CATALOG_GAMES,
        actual: catalogGameCount,
      },
    });
  }

  const featuredGames = z
    .array(storeFeaturedSnapshotEntrySchema)
    .parse(featuredRows);
  const featuredCountValid =
    featuredGames.length >= STORE_MINIMUM_FEATURED_GAMES &&
    featuredGames.length <= STORE_MAXIMUM_FEATURED_GAMES;
  if (!featuredCountValid) {
    blockers.push({
      code: "FEATURED_COUNT_INVALID",
      message: `Choose between ${STORE_MINIMUM_FEATURED_GAMES} and ${STORE_MAXIMUM_FEATURED_GAMES} Featured games.`,
      details: {
        minimum: STORE_MINIMUM_FEATURED_GAMES,
        maximum: STORE_MAXIMUM_FEATURED_GAMES,
        actual: featuredGames.length,
      },
    });
  }

  const reasonMissingIds = featuredGames
    .filter(
      ({ recommendation_reason }) =>
        (recommendation_reason?.trim().length ?? 0) === 0,
    )
    .map(({ game_id }) => game_id);
  if (reasonMissingIds.length > 0) {
    blockers.push({
      code: "FEATURED_REASON_MISSING",
      message: "Every Featured game needs a non-empty recommendation reason.",
      details: { game_ids: reasonMissingIds },
    });
  }

  const eligibleFeatured =
    featuredGames.length === 0
      ? []
      : await client.game.findMany({
          where: {
            id: { in: featuredGames.map(({ game_id }) => game_id) },
            status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
            AND: [curationWhere],
          },
          select: { id: true },
        });
  const eligibleFeaturedIds = new Set(eligibleFeatured.map(({ id }) => id));
  const outsideCatalogIds = featuredGames
    .filter(({ game_id }) => !eligibleFeaturedIds.has(game_id))
    .map(({ game_id }) => game_id);
  if (outsideCatalogIds.length > 0) {
    blockers.push({
      code: "FEATURED_OUTSIDE_CATALOG",
      message: "Every Featured game must be eligible in the draft catalog.",
      details: { game_ids: outsideCatalogIds },
    });
  }

  const editorialHighlight =
    featuredCountValid &&
    reasonMissingIds.length === 0 &&
    outsideCatalogIds.length === 0;
  const readiness: StorePublicationReadinessV2 = {
    version: STORE_READINESS_VERSION,
    ready: blockers.length === 0,
    catalog_game_count: catalogGameCount,
    checks: {
      brand_complete: brandComplete,
      catalog_intentional: catalogIntentional,
      catalog_has_games: catalogHasGames,
      editorial_highlight: editorialHighlight,
    },
    blockers,
  };

  return {
    readiness,
    draft:
      publishableCatalog && draftCatalog.catalog_mode !== "UNDECIDED"
        ? {
            store,
            catalog_mode: draftCatalog.catalog_mode,
            catalog: publishableCatalog,
            featured_games: featuredGames,
            presentation: resolveDraftPresentation({ slug: store.slug }),
          }
        : null,
  };
}

export async function getStorePublicationReadiness(
  storeId: string,
  client: StoreRevisionClient = prisma,
): Promise<StorePublicationReadinessV2> {
  return (await assessDraft(storeId, client)).readiness;
}

export async function getReadyDraftSnapshot(
  storeId: string,
  client: StoreRevisionClient,
): Promise<{
  readiness: StorePublicationReadinessV2;
  draft: StoreDraftSnapshot | null;
}> {
  return assessDraft(storeId, client);
}

export async function createStoreRevision({
  draft,
  actorUserId,
  client,
}: {
  draft: StoreDraftSnapshot;
  actorUserId: string;
  client: StoreRevisionClient;
}): Promise<StoreRevision> {
  const latest = await client.storeRevision.aggregate({
    where: { store_id: draft.store.id },
    _max: { revision: true },
  });
  const revision = (latest._max.revision ?? 0) + 1;

  return client.storeRevision.create({
    data: {
      store_id: draft.store.id,
      revision,
      source_draft_revision: draft.store.draft_revision,
      actor_user_id: actorUserId,
      catalog_mode: draft.catalog_mode,
      name: draft.store.name,
      description: draft.store.description,
      logo_url: draft.store.logo_url,
      tag_filters: draft.catalog.tag_filters as Prisma.InputJsonValue,
      game_overrides: draft.catalog.game_overrides as Prisma.InputJsonValue,
      featured_games: draft.featured_games as Prisma.InputJsonValue,
      presentation: draft.presentation as Prisma.InputJsonValue,
    },
  });
}
