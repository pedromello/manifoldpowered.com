import { Prisma, type StoreSelection } from "generated/prisma/client";
import {
  featuredVideoFields,
  featuredVideoFromId,
} from "contracts/featured-video";
import { prisma } from "infra/database";
import { ConflictError, NotFoundError, ValidationError } from "infra/errors";
import {
  selectionCreateSchema,
  selectionUpdateSchema,
  selectionSnapshotSchema,
  selectionPath,
  type SelectionInput,
  type SelectionUpdate,
  type SelectionSnapshot,
  type SelectionSummary,
} from "contracts/outlet-selections";
import {
  getCurationWhereClause,
  getSnapshotCurationWhereClause,
} from "models/store_catalog";
import { parseStoreRevision } from "models/store_revision";
import { isTransactionWriteConflict } from "lib/transaction-conflict";
import { recordSelectionEmailPublication } from "models/selection_email_event";
import { enqueueSelectionEmailEvent } from "infra/selection-email-queue";

type Client = Prisma.TransactionClient;

export function selectionNotFound() {
  return new NotFoundError({
    message: "Selection not found.",
    action:
      "Check the outlet and selection slugs or use an authorized preview.",
  });
}

function conflict(expected: number, actual?: number) {
  return new ConflictError({
    message: "The selection draft changed before the action completed.",
    action: "Read the latest selection, review the changes, and try again.",
    context: {
      expected_draft_revision: expected,
      actual_draft_revision: actual,
    },
  });
}

function snapshot(row: StoreSelection): SelectionSnapshot {
  return selectionSnapshotSchema.parse({
    title: row.title,
    description: row.description,
    cover_url: row.cover_url,
    featured_video: featuredVideoFromId(
      row.featured_video_id,
      row.featured_video_start_seconds,
    ),
    image_urls: row.image_urls,
    game_ids: row.game_ids,
  });
}

async function resolveGames(storeId: string, slugs: string[], tx: Client) {
  if (slugs.length === 0) return [];
  const curation = await getCurationWhereClause(storeId, tx);
  const games = await tx.game.findMany({
    where: {
      slug: { in: slugs },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      AND: [curation],
    },
    select: { id: true, slug: true },
  });
  const ids = new Map(games.map((game) => [game.slug, game.id]));
  const invalid = slugs.filter((slug) => !ids.has(slug));
  if (invalid.length) {
    throw new ValidationError({
      message:
        "Some selected games are unavailable or outside the outlet catalog.",
      action: "Add eligible games to the outlet catalog before selecting them.",
      context: { game_slugs: invalid },
    });
  }
  return slugs.map((slug) => ids.get(slug)!);
}

async function create(storeId: string, value: SelectionInput) {
  const input = selectionCreateSchema.parse(value);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const { game_slugs, featured_video_url, ...fields } = input;
        const game_ids = await resolveGames(storeId, game_slugs, tx);
        return tx.storeSelection.create({
          data: {
            ...fields,
            store_id: storeId,
            game_ids,
            ...featuredVideoFields(featured_video_url),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: "This outlet already has a selection with that slug.",
        action: "Choose another selection slug.",
      });
    }
    throw error;
  }
}

async function findDraft(storeId: string, slug: string, tx: Client = prisma) {
  const found = await tx.storeSelection.findUnique({
    where: { store_id_slug: { store_id: storeId, slug } },
  });
  if (!found) throw selectionNotFound();
  return found;
}

async function mutate(
  storeId: string,
  slug: string,
  expected: number,
  action: (tx: Client, row: StoreSelection) => Promise<StoreSelection>,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const row = await findDraft(storeId, slug, tx);
        if (row.draft_revision !== expected)
          throw conflict(expected, row.draft_revision);
        const guard = await tx.storeSelection.updateMany({
          where: { id: row.id, store_id: storeId, draft_revision: expected },
          data: { draft_revision: { increment: 1 } },
        });
        if (guard.count !== 1) throw conflict(expected);
        return action(tx, row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      isTransactionWriteConflict(error) ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002")
    ) {
      const latest = await findDraft(storeId, slug);
      throw conflict(expected, latest.draft_revision);
    }
    throw error;
  }
}

async function update(storeId: string, slug: string, value: SelectionUpdate) {
  const input = selectionUpdateSchema.parse(value);
  return mutate(
    storeId,
    slug,
    input.expected_draft_revision,
    async (tx, row) => {
      const game_slugs = input.game_slugs;
      const fields = {
        title: input.title,
        description: input.description,
        cover_url: input.cover_url,
        ...(input.featured_video_url !== undefined
          ? featuredVideoFields(input.featured_video_url)
          : {}),
        image_urls: input.image_urls,
      };
      const game_ids =
        game_slugs === undefined
          ? undefined
          : await resolveGames(storeId, game_slugs, tx);
      return tx.storeSelection.update({
        where: { id: row.id },
        data: { ...fields, game_ids },
      });
    },
  );
}

async function readiness(row: StoreSelection, tx: Client = prisma) {
  const blockers: Array<{
    code: string;
    message: string;
    game_ids?: string[];
  }> = [];
  if (!row.title.trim())
    blockers.push({
      code: "TITLE_REQUIRED",
      message: "Add a selection title.",
    });
  if (!row.description.trim())
    blockers.push({
      code: "DESCRIPTION_REQUIRED",
      message: "Explain this selection.",
    });
  if (!row.cover_url)
    blockers.push({ code: "COVER_REQUIRED", message: "Choose a cover image." });
  if (row.game_ids.length === 0)
    blockers.push({
      code: "GAMES_REQUIRED",
      message: "Select at least one game.",
    });
  const outlet = await tx.store.findUnique({ where: { id: row.store_id } });
  const revision =
    outlet?.status === "PUBLISHED" && outlet.published_revision_id
      ? await tx.storeRevision.findFirst({
          where: { id: outlet.published_revision_id, store_id: outlet.id },
        })
      : null;
  if (!revision) {
    blockers.push({
      code: "OUTLET_NOT_PUBLISHED",
      message: "Publish the outlet before publishing its selections.",
    });
  } else if (row.game_ids.length) {
    const published = parseStoreRevision(revision, outlet!.slug);
    const curation = await getSnapshotCurationWhereClause(
      published.catalog,
      tx,
    );
    const eligible = await tx.game.findMany({
      where: {
        id: { in: row.game_ids },
        status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
        AND: [curation],
      },
      select: { id: true },
    });
    const ids = new Set(eligible.map(({ id }) => id));
    const invalid = row.game_ids.filter((id) => !ids.has(id));
    if (invalid.length)
      blockers.push({
        code: "GAMES_OUTSIDE_PUBLISHED_CATALOG",
        message:
          "Publish the outlet catalog changes or remove ineligible games.",
        game_ids: invalid,
      });
  }
  return { ready: blockers.length === 0, blockers };
}

async function publish(
  storeId: string,
  slug: string,
  actorId: string,
  expected: number,
) {
  let notificationEventId: string | null = null;
  const published = await mutate(storeId, slug, expected, async (tx, row) => {
    const result = await readiness(row, tx);
    if (!result.ready)
      throw new ValidationError({
        message: "The selection is not ready to publish.",
        action: "Resolve the publication blockers and try again.",
        context: result,
      });
    const revision = await tx.storeSelectionRevision.create({
      data: {
        selection_id: row.id,
        revision: row.published_revision + 1,
        source_draft_revision: expected,
        actor_user_id: actorId,
        snapshot: snapshot(row) as Prisma.InputJsonValue,
      },
    });
    if (row.published_revision === 0)
      notificationEventId = await recordSelectionEmailPublication(tx, {
        selectionId: row.id,
        storeId,
        revisionId: revision.id,
        occurredAt: revision.created_at,
      });
    return tx.storeSelection.update({
      where: { id: row.id },
      data: {
        status: "PUBLISHED",
        published_revision: revision.revision,
        published_revision_id: revision.id,
        published_at: revision.created_at,
      },
    });
  });
  if (notificationEventId) {
    try {
      await enqueueSelectionEmailEvent(notificationEventId);
    } catch {
      // Publication already committed. The durable outbox is recovered by cron.
      console.warn(
        JSON.stringify({
          component: "selection_email_outbox",
          outcome: "queue_wakeup_pending",
        }),
      );
    }
  }
  return published;
}

async function unpublish(storeId: string, slug: string, expected: number) {
  return mutate(storeId, slug, expected, (tx, row) =>
    tx.storeSelection.update({
      where: { id: row.id },
      data: {
        status: "DRAFT",
        published_revision_id: null,
        published_at: null,
      },
    }),
  );
}

async function publicSnapshot(row: StoreSelection, tx: Client = prisma) {
  if (row.status !== "PUBLISHED" || !row.published_revision_id)
    throw selectionNotFound();
  const revision = await tx.storeSelectionRevision.findFirst({
    where: { id: row.published_revision_id, selection_id: row.id },
  });
  if (!revision) throw selectionNotFound();
  return selectionSnapshotSchema.parse(revision.snapshot);
}

async function summary(
  row: StoreSelection,
  storeSlug: string,
  content: SelectionSnapshot,
  preview = false,
  resolvedSlugs?: Map<string, string>,
): Promise<SelectionSummary> {
  const games = resolvedSlugs
    ? []
    : await prisma.game.findMany({
        where: { id: { in: content.game_ids } },
        select: { id: true, slug: true },
      });
  const slugs =
    resolvedSlugs ?? new Map(games.map(({ id, slug }) => [id, slug]));
  return {
    id: row.id,
    slug: row.slug,
    title: content.title,
    description: content.description,
    cover_url: content.cover_url,
    featured_video: content.featured_video,
    image_urls: content.image_urls,
    game_slugs: content.game_ids.flatMap((id) =>
      slugs.has(id) ? [slugs.get(id)!] : [],
    ),
    status: row.status,
    published_revision: row.published_revision,
    published_at: row.published_at?.toISOString() ?? null,
    public_path: selectionPath(storeSlug, row.slug),
    ...(preview ? { draft_revision: row.draft_revision } : {}),
  };
}

async function list(storeId: string, preview: boolean, page = 1, limit = 20) {
  const where: Prisma.StoreSelectionWhereInput = {
    store_id: storeId,
    ...(preview
      ? {}
      : { status: "PUBLISHED", published_revision_id: { not: null } }),
  };
  const [rows, total] = await Promise.all([
    prisma.storeSelection.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.storeSelection.count({ where }),
  ]);
  return {
    rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function summaries(
  rows: StoreSelection[],
  storeSlug: string,
  preview: boolean,
  curation: Prisma.GameWhereInput = {},
) {
  if (!rows.length) return [];
  const revisions = preview
    ? []
    : await prisma.storeSelectionRevision.findMany({
        where: {
          id: {
            in: rows.flatMap((row) =>
              row.published_revision_id ? [row.published_revision_id] : [],
            ),
          },
        },
      });
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );
  const contents = rows.map((row) => {
    if (preview) return snapshot(row);
    const revision = revisionById.get(row.published_revision_id!);
    if (!revision || revision.selection_id !== row.id)
      throw selectionNotFound();
    return selectionSnapshotSchema.parse(revision.snapshot);
  });
  const gameIds = Array.from(
    new Set(contents.flatMap((content) => content.game_ids)),
  );
  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
      ...(!preview
        ? {
            status: { in: ["ACTIVE" as const, "ONLY_DISPLAY" as const] },
            AND: [curation],
          }
        : {}),
    },
    select: { id: true, slug: true },
  });
  const slugs = new Map(games.map(({ id, slug }) => [id, slug]));
  return Promise.all(
    rows.map((row, index) =>
      summary(row, storeSlug, contents[index], preview, slugs),
    ),
  );
}

export type SelectionDiscoveryCursor = { published_at: Date; id: string };
export type SelectionDiscoveryCandidate = SelectionDiscoveryCursor & {
  store_slug: string;
  selection_slug: string;
};

async function discoveryCandidates(
  limit: number,
  after?: SelectionDiscoveryCursor,
) {
  const cursor = after
    ? Prisma.sql`AND (c.published_at < ${after.published_at}
    OR (c.published_at = ${after.published_at} AND c.id > ${after.id}))`
    : Prisma.empty;
  return prisma.$queryRaw<SelectionDiscoveryCandidate[]>`
      SELECT s.slug AS store_slug, c.slug AS selection_slug, c.published_at, c.id
      FROM store_selections c JOIN stores s ON s.id = c.store_id
      WHERE c.status = 'PUBLISHED' AND c.published_revision_id IS NOT NULL
        AND s.status = 'PUBLISHED' AND s.published_revision_id IS NOT NULL
        ${cursor}
      ORDER BY c.published_at DESC, c.id ASC LIMIT ${limit}
  `;
}

async function sitemapEntries() {
  return prisma.$queryRaw<
    Array<{ store_slug: string; selection_slug: string; published_at: Date }>
  >`
    SELECT s.slug AS store_slug, c.slug AS selection_slug, c.published_at
    FROM store_selections c JOIN stores s ON s.id = c.store_id
    WHERE c.status = 'PUBLISHED' AND c.published_revision_id IS NOT NULL
      AND s.status = 'PUBLISHED' AND s.published_revision_id IS NOT NULL
    ORDER BY c.id ASC
  `;
}

const storeSelection = {
  create,
  findDraft,
  update,
  readiness,
  publish,
  unpublish,
  snapshot,
  publicSnapshot,
  summary,
  summaries,
  list,
  discoveryCandidates,
  sitemapEntries,
};
export default storeSelection;
