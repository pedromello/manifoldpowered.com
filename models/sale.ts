import { prisma } from "infra/database";
import { Prisma } from "generated/prisma/client";

// There is deliberately no record() here. A sale is only ever created by
// library.acquireGame, inside the transaction that also writes the balanced
// ledger entries describing it — a standalone writer would let a sale exist
// with no entries, which is the one state the books cannot represent. The
// previous unused record() was removed rather than taught about currency,
// since its only possible effect was to reintroduce that gap.

interface ListOptions {
  page?: number;
  limit?: number;
}

async function listByStore(storeId: string, options: ListOptions = {}) {
  return await listWhere({ store_id: storeId }, options);
}

// Everything a buyer bought, for their own eyes.
async function listByUser(userId: string, options: ListOptions = {}) {
  return await listWhere({ user_id: userId }, options);
}

// Every sale of a studio's games.
//
// Sale has no studio_id, so this resolves through the catalogue: the studio's
// game ids, then the sales against them. Denormalising studio_id onto Sale
// would make this one query instead of two, but it would also mean a game
// changing studio silently rewrites history, and sales are append-only for a
// reason.
async function listByStudio(studioId: string, options: ListOptions = {}) {
  const games = await prisma.game.findMany({
    where: { studio_id: studioId },
    select: { id: true },
  });

  if (games.length === 0) {
    return emptyPage(options);
  }

  return await listWhere(
    { game_id: { in: games.map((gameRow) => gameRow.id) } },
    options,
  );
}

// One shared query shape, so every audience gets the same ordering, the same
// pagination envelope, and the same joined game title. What differs between
// them is the filter above and the filterOutput branch after — never the shape.
async function listWhere(
  where: Prisma.SaleWhereInput,
  { page = 1, limit = 20 }: ListOptions = {},
) {
  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sale.count({ where }),
  ]);

  const gameIds = [...new Set(sales.map((saleItem) => saleItem.game_id))];
  const games = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, title: true, slug: true },
  });
  const gameById = new Map(games.map((gameRow) => [gameRow.id, gameRow]));
  const storeIds = [
    ...new Set(
      sales
        .map((saleItem) => saleItem.store_id)
        .filter((storeId): storeId is string => storeId !== null),
    ),
  ];
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, slug: true },
  });
  const storeById = new Map(stores.map((storeRow) => [storeRow.id, storeRow]));
  const revisionIds = [
    ...new Set(
      sales
        .map((saleItem) => saleItem.store_revision_id)
        .filter((revisionId): revisionId is string => revisionId !== null),
    ),
  ];
  const revisions = await prisma.storeRevision.findMany({
    where: { id: { in: revisionIds } },
    select: { id: true, store_id: true, name: true, logo_url: true },
  });
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );

  const salesWithGame = sales.map((saleItem) => {
    const saleStore = saleItem.store_id
      ? storeById.get(saleItem.store_id)
      : null;
    const saleRevision = saleItem.store_revision_id
      ? revisionById.get(saleItem.store_revision_id)
      : null;
    const validRevision =
      saleRevision && saleRevision.store_id === saleItem.store_id
        ? saleRevision
        : null;
    return {
      ...saleItem,
      game_title: gameById.get(saleItem.game_id)?.title || "Unknown game",
      game_slug: gameById.get(saleItem.game_id)?.slug || null,
      store_name: validRevision?.name || null,
      store_slug: saleStore?.slug || null,
      store_logo_url: validRevision?.logo_url || null,
    };
  });

  return {
    sales: salesWithGame,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

function emptyPage({ page = 1, limit = 20 }: ListOptions = {}) {
  return {
    sales: [],
    pagination: { page, limit, total: 0, pages: 0 },
  };
}

const sale = {
  listByStore,
  listByUser,
  listByStudio,
};

export default sale;
