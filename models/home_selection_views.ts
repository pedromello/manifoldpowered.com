import type { NextApiRequest } from "next";
import type { StoreSelection } from "generated/prisma/client";
import { prisma } from "infra/database";
import store, { projectPublishedStore } from "models/store";
import storeSelection from "models/store_selection";
import storefrontPricing from "models/storefront_pricing";
import { selectionSnapshotSchema } from "contracts/outlet-selections";
import { filterStorefrontEditorial } from "models/storefront_editorial";
import type { SelectionView } from "models/store_selection_view";
import {
  catalogMatchTags,
  gameMatchesCatalogSnapshot,
} from "models/store_catalog";
import type { SelectionPageApi } from "lib/selection-client";

type PublishedOutlet = Awaited<ReturnType<typeof store.findOneForStorefront>>;

/** Request-scoped batch projection. Never reads mutable selection/outlet copy. */
export async function publicSelectionViews(
  req: NextApiRequest,
  rows: StoreSelection[],
  suppliedOutlets?: PublishedOutlet[],
): Promise<SelectionView[]> {
  if (!rows.length) return [];
  const published = rows.filter(
    (row) => row.status === "PUBLISHED" && row.published_revision_id,
  );
  let outlets = suppliedOutlets;
  if (!outlets) {
    const storeRows = await prisma.store.findMany({
      where: {
        id: { in: published.map((row) => row.store_id) },
        status: "PUBLISHED",
        published_revision_id: { not: null },
      },
    });
    const revisions = await prisma.storeRevision.findMany({
      where: {
        id: {
          in: storeRows.flatMap((row) =>
            row.published_revision_id ? [row.published_revision_id] : [],
          ),
        },
      },
    });
    const byId = new Map(revisions.map((revision) => [revision.id, revision]));
    outlets = storeRows.flatMap((row) => {
      const revision = byId.get(row.published_revision_id!);
      if (!revision || revision.store_id !== row.id) return [];
      try {
        return [projectPublishedStore(row, revision)];
      } catch {
        return [];
      }
    });
  }
  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const revisions = await prisma.storeSelectionRevision.findMany({
    where: { id: { in: published.map((row) => row.published_revision_id!) } },
  });
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );
  const entries = published.flatMap((row) => {
    const revision = revisionById.get(row.published_revision_id!);
    const outlet = outletById.get(row.store_id);
    const content =
      revision?.selection_id === row.id
        ? selectionSnapshotSchema.safeParse(revision.snapshot)
        : null;
    return outlet && content?.success
      ? [{ row, outlet, content: content.data }]
      : [];
  });
  if (!entries.length) return [];
  const knownTags = await catalogMatchTags(
    entries.flatMap(({ outlet }) =>
      outlet.catalog_snapshot ? [outlet.catalog_snapshot] : [],
    ),
  );
  const { currency, gameIds } =
    await storefrontPricing.idConstraintForRequest(req);
  const games = await prisma.game.findMany({
    where: {
      id: {
        in: [...new Set(entries.flatMap(({ content }) => content.game_ids))],
      },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      ...(gameIds
        ? { OR: [{ status: "ONLY_DISPLAY" as const }, { id: { in: gameIds } }] }
        : {}),
    },
  });
  const context = await storefrontPricing.contextFor(currency, games, req);
  // Membership is checked per publication after the shared game query. A game
  // shared by two outlets must never cross their individual catalog filters.
  const gameById = new Map(games.map((game) => [game.id, game]));
  const result = await Promise.all(
    entries.map(async ({ row, outlet, content }) => {
      const ordered = content.game_ids.flatMap((id) => {
        const game = gameById.get(id);
        return game &&
          outlet.catalog_snapshot &&
          gameMatchesCatalogSnapshot(game, outlet.catalog_snapshot, knownTags)
          ? [game]
          : [];
      });
      const priced = storefrontPricing.filterAndPrice(
        req.context.user,
        ordered,
        context,
      );
      if (!priced.length) return null;
      const summary = await storeSelection.summary(
        row,
        outlet.slug,
        content,
        false,
        new Map(priced.map((game) => [game.id, game.slug])),
      );
      return {
        selection: summary,
        outlet: {
          id: outlet.id,
          slug: outlet.slug,
          name: outlet.name,
          logo_url: outlet.logo_url,
          brand_tokens: outlet.presentation
            .brand_tokens as SelectionPageApi["outlet"]["brand_tokens"],
          theme_key: outlet.theme_key,
        },
        games: priced.slice(0, 3).map((game) => {
          const editorial = outlet.game_editorials_snapshot.find(
            (review) => review.game_id === game.id,
          );
          const review = filterStorefrontEditorial(req.context.user, editorial);
          const featured = outlet.featured_games_snapshot.find(
            (pick) => pick.game_id === game.id,
          );
          return {
            ...game,
            recommendation_reason:
              review?.headline?.trim() ||
              review?.body.trim() ||
              featured?.recommendation_reason?.trim() ||
              null,
            outlet_review: review,
          };
        }),
        currency,
      };
    }),
  );
  return result.filter(
    (view): view is NonNullable<typeof view> => view !== null,
  );
}
