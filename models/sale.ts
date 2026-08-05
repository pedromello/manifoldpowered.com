import { prisma } from "infra/database";

// There is deliberately no record() here. A sale is only ever created by
// library.acquireGame, inside the transaction that also writes the balanced
// ledger entries describing it — a standalone writer would let a sale exist
// with no entries, which is the one state the books cannot represent. The
// previous unused record() was removed rather than taught about currency,
// since its only possible effect was to reintroduce that gap.
async function listByStore(
  storeId: string,
  {
    page = 1,
    limit = 20,
  }: {
    page?: number;
    limit?: number;
  } = {},
) {
  const where = { store_id: storeId };

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
    select: { id: true, title: true },
  });
  const titleByGameId = games.reduce(
    (acc, gameRow) => {
      acc[gameRow.id] = gameRow.title;
      return acc;
    },
    {} as Record<string, string>,
  );

  const salesWithGameTitle = sales.map((saleItem) => ({
    ...saleItem,
    game_title: titleByGameId[saleItem.game_id] || "Unknown game",
  }));

  return {
    sales: salesWithGameTitle,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

const sale = {
  listByStore,
};

export default sale;
