import { prisma } from "infra/database";

interface RecordSaleDto {
  user_id: string;
  game_id: string;
  store_id: string | null;
  price_at_sale: string;
}

async function record(saleDto: RecordSaleDto) {
  return await prisma.sale.create({
    data: {
      user_id: saleDto.user_id,
      game_id: saleDto.game_id,
      store_id: saleDto.store_id,
      price_at_sale: saleDto.price_at_sale,
    },
  });
}

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

  return {
    sales,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

const sale = {
  record,
  listByStore,
};

export default sale;
