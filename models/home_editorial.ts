import type { NextApiRequest } from "next";
import { prisma } from "infra/database";
import { ConflictError, ValidationError } from "infra/errors";
import { homeUpdateSchema } from "contracts/home-editorial";
import type { PublicHome, AdminHome } from "lib/home-client";
import { discoverSelections } from "models/store_selection_discovery";
import { publicSelectionViews } from "models/home_selection_views";
import store from "models/store";
import type { SelectionPageApi } from "lib/selection-client";
import storefrontPricing from "models/storefront_pricing";
import {
  catalogMatchTags,
  gameMatchesCatalogSnapshot,
} from "models/store_catalog";

export async function homeConfiguration() {
  return (
    (await prisma.homeEditorial.findUnique({ where: { id: "home" } })) ?? {
      selection_ids: [],
      revision: 0,
      updated_by: null,
      updated_at: null,
    }
  );
}

export async function configuredSelections(req: NextApiRequest, ids: string[]) {
  if (!ids.length) return [];
  const rows = await prisma.storeSelection.findMany({
    where: { id: { in: ids } },
  });
  const views = await publicSelectionViews(req, rows);
  const byId = new Map(views.map((view) => [view.selection.id, view]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

export async function resolveHomeSelections(
  req: NextApiRequest,
  ids: string[],
): Promise<Pick<PublicHome, "mode" | "selections">> {
  const manual = await configuredSelections(req, ids);
  if (manual.length)
    return { mode: "manual", selections: manual as SelectionPageApi[] };
  const automatic = await discoverSelections(req, 3, async (candidates) => {
    const views = await configuredSelections(
      req,
      candidates.map(({ id }) => id),
    );
    const byId = new Map(views.map((view) => [view.selection.id, view]));
    return candidates.map(({ id }) => byId.get(id) ?? null);
  });
  return {
    mode: automatic.length ? "automatic" : "catalog",
    selections: automatic as SelectionPageApi[],
  };
}

export async function homeCommunities(req: NextApiRequest) {
  const { stores } = await store.findAllPublishedPaginated({ limit: 12 });
  if (!stores.length) return [];
  const knownTags = await catalogMatchTags(
    stores.flatMap((outlet) =>
      outlet.catalog_snapshot ? [outlet.catalog_snapshot] : [],
    ),
  );
  // Published featured picks introduce communities even without named selections.
  // The snapshot limits this batch to at most 36 game IDs.
  const ids = [
    ...new Set(
      stores.flatMap((outlet) =>
        outlet.featured_games_snapshot.map((pick) => pick.game_id),
      ),
    ),
  ];
  const { currency, gameIds } =
    await storefrontPricing.idConstraintForRequest(req);
  const games = await prisma.game.findMany({
    where: {
      id: { in: ids },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      ...(gameIds
        ? { OR: [{ status: "ONLY_DISPLAY" as const }, { id: { in: gameIds } }] }
        : {}),
    },
  });
  const pricing = await storefrontPricing.contextFor(currency, games, req);
  const byId = new Map(games.map((game) => [game.id, game]));
  return stores.map((outlet) => {
    const ordered = outlet.featured_games_snapshot.flatMap((pick) => {
      const game = byId.get(pick.game_id);
      return game &&
        outlet.catalog_snapshot &&
        gameMatchesCatalogSnapshot(game, outlet.catalog_snapshot, knownTags)
        ? [game]
        : [];
    });
    return {
      id: outlet.id,
      slug: outlet.slug,
      name: outlet.name,
      logo_url: outlet.logo_url,
      description: outlet.presentation?.tagline || outlet.description,
      cover_url: outlet.presentation?.cover_image_url || null,
      games: storefrontPricing
        .filterAndPrice(req.context.user, ordered, pricing)
        .slice(0, 3),
    };
  });
}

export async function publicHome(req: NextApiRequest): Promise<PublicHome> {
  const configuration = await homeConfiguration();
  const [editorial, communities] = await Promise.all([
    resolveHomeSelections(req, configuration.selection_ids),
    homeCommunities(req),
  ]);
  return { ...editorial, communities };
}

export async function adminHome(req: NextApiRequest): Promise<AdminHome> {
  const configuration = await homeConfiguration();
  const manual = await configuredSelections(req, configuration.selection_ids);
  const byId = new Map(manual.map((entry) => [entry.selection.id, entry]));
  const resolved = manual.length
    ? { mode: "manual" as const, selections: manual as SelectionPageApi[] }
    : await resolveHomeSelections(req, []);
  return {
    ...configuration,
    updated_at: configuration.updated_at?.toISOString() ?? null,
    items: configuration.selection_ids.map((id) => ({
      id,
      entry: (byId.get(id) as SelectionPageApi | undefined) ?? null,
    })),
    resolved: { ...resolved, communities: [] },
  };
}

export async function saveHome(input: unknown, actorId: string) {
  const parsed = homeUpdateSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError({
      message: "Invalid homepage configuration.",
      action:
        "Choose up to three different published selections and a valid revision.",
    });
  const { selection_ids, expected_revision } = parsed.data;
  // Publication validation and the compare-and-swap write share a transaction;
  // the public read also rechecks publication and regional eligibility.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.storeSelection.findMany({
      where: {
        id: { in: selection_ids },
        status: "PUBLISHED",
        published_revision_id: { not: null },
      },
    });
    const outlets = await tx.store.findMany({
      where: {
        id: { in: rows.map((row) => row.store_id) },
        status: "PUBLISHED",
        published_revision_id: { not: null },
      },
    });
    const revisions = await tx.storeSelectionRevision.findMany({
      where: {
        id: {
          in: rows.flatMap((row) =>
            row.published_revision_id ? [row.published_revision_id] : [],
          ),
        },
      },
    });
    const outletRevisions = await tx.storeRevision.findMany({
      where: {
        id: {
          in: outlets.flatMap((row) =>
            row.published_revision_id ? [row.published_revision_id] : [],
          ),
        },
      },
    });
    if (
      rows.length !== selection_ids.length ||
      rows.some(
        (row) =>
          !revisions.some(
            (revision) =>
              revision.id === row.published_revision_id &&
              revision.selection_id === row.id,
          ) ||
          !outlets.some(
            (outlet) =>
              outlet.id === row.store_id &&
              outletRevisions.some(
                (revision) =>
                  revision.id === outlet.published_revision_id &&
                  revision.store_id === outlet.id,
              ),
          ),
      )
    ) {
      throw new ValidationError({
        message: "Some selections are no longer published.",
        action: "Remove unavailable selections and try again.",
      });
    }
    // Tests may truncate the singleton; upsert safely restores its empty state.
    await tx.homeEditorial.upsert({
      where: { id: "home" },
      create: { id: "home" },
      update: {},
    });
    const changed = await tx.homeEditorial.updateMany({
      where: { id: "home", revision: expected_revision },
      data: { selection_ids, revision: { increment: 1 }, updated_by: actorId },
    });
    if (changed.count !== 1)
      throw new ConflictError({
        message: "The homepage configuration changed.",
        action: "Reload the latest configuration before saving.",
      });
    await tx.adminActionLog.create({
      data: {
        admin_user_id: actorId,
        action: "UPDATE_HOME_EDITORIAL",
        target_type: "home_editorial",
        target_id: "home",
        metadata: { selection_ids, revision: expected_revision + 1 },
      },
    });
    return tx.homeEditorial.findUniqueOrThrow({ where: { id: "home" } });
  });
}
