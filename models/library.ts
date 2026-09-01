import { prisma } from "infra/database";
import { ItemType, Prisma } from "generated/prisma/client";
import { NotFoundError } from "infra/errors";
import game from "models/game";
import store from "models/store";
import pricing, { BASE_CURRENCY } from "models/pricing";
import commercialTerms from "models/commercial_terms";
import ledger, { LedgerEntryDto } from "models/ledger";

// Storage scale for money. Amounts are quantised to it before they reach the
// ledger, which refuses anything finer rather than rounding it.
const MONEY_SCALE = 4;

interface Affiliate {
  store_id: string;
}

async function acquireGame(
  userId: string,
  gameSlug: string,
  storeSlug?: string,
  currencyCode: string = BASE_CURRENCY,
) {
  const existingGame = await game.findOneBySlug(gameSlug);
  if (!existingGame) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Verify the game exists",
    });
  }

  game.ensurePurchasable(existingGame);

  // What the buyer is actually charged, in their own currency. Throws when the
  // game has no price here, which is the same answer the listings and the
  // detail page already give — a game you cannot see a price for is a game you
  // cannot buy.
  const resolvedPrice = await pricing.priceForOrFail(
    existingGame,
    currencyCode,
  );

  const affiliate = await resolveAffiliateLeniently(storeSlug);
  // A free acquisition still gets a Sale row so attribution and acquisition
  // history stay intact, but it moves no money. Looking up commercial terms or
  // writing a zero-value ledger set would be both unnecessary and invalid: the
  // ledger deliberately rejects entries whose amount is zero.
  const supplierCostRate = resolvedPrice.amount.isZero()
    ? null
    : await commercialTerms.supplierCostRateFor(existingGame);

  return await prisma.$transaction(async (tx) => {
    // The entitlement is idempotent; the Sale deliberately is not. A Sale
    // records an acquisition *event*, so the same user acquiring the same game
    // through a different outlet later keeps that outlet's attribution rather
    // than being swallowed by the entitlement they already hold.
    //
    // Open question now that a sale also mints commission: whether a repeat
    // acquisition through the *same* outlet should earn again. It currently
    // does. See docs/payments-tasks.md.
    const libraryItem = await tx.libraryItem.upsert({
      where: {
        user_id_item_id_item_type: {
          user_id: userId,
          item_id: existingGame.id,
          item_type: "GAME",
        },
      },
      update: {},
      create: {
        user_id: userId,
        item_id: existingGame.id,
        item_type: "GAME",
      },
    });

    const sale = await tx.sale.create({
      data: {
        user_id: userId,
        game_id: existingGame.id,
        store_id: affiliate?.store_id ?? null,
        price_at_sale: resolvedPrice.amount,
        currency: resolvedPrice.currency,
        exchange_rate: resolvedPrice.exchange_rate,
      },
    });

    if (!resolvedPrice.amount.isZero() && supplierCostRate) {
      await recordSaleEntries(tx, {
        sale_id: sale.id,
        gross: resolvedPrice.amount,
        currency: resolvedPrice.currency,
        exchange_rate: resolvedPrice.exchange_rate,
        supplier_cost_rate: supplierCostRate,
        affiliate,
      });
    }

    return libraryItem;
  });
}

interface SaleEntriesDto {
  sale_id: string;
  gross: Prisma.Decimal;
  currency: string;
  exchange_rate: Prisma.Decimal | null;
  supplier_cost_rate: Prisma.Decimal;
  affiliate: Affiliate | null;
}

// The balanced set describing one sale.
//
// Platform revenue is the residual — gross minus what everyone else takes —
// and is never computed independently. Each share is quantised to the storage
// scale first, so `gross × (1 − s − c)` would leave a sub-cent remainder and
// the set would not sum to zero. Subtracting makes the platform absorb the
// rounding, which is both correct and the only party that can.
async function recordSaleEntries(
  tx: Prisma.TransactionClient,
  saleDto: SaleEntriesDto,
) {
  const supplierCost = saleDto.gross
    .mul(saleDto.supplier_cost_rate)
    .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);

  const commission = saleDto.affiliate
    ? saleDto.gross
        .mul(
          commercialTerms.commissionRateFor(
            await tx.store.findUniqueOrThrow({
              where: { id: saleDto.affiliate.store_id },
              select: { commission_rate: true },
            }),
          ),
        )
        .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal(0);

  const platformRevenue = saleDto.gross.minus(supplierCost).minus(commission);

  const sharedFields = {
    currency: saleDto.currency,
    exchange_rate: saleDto.exchange_rate,
    exchange_rate_from_currency:
      saleDto.exchange_rate === null ? null : BASE_CURRENCY,
  };

  const entries: LedgerEntryDto[] = [
    {
      ...sharedFields,
      account_type: "CONSUMER_PAYMENT",
      amount: saleDto.gross,
      description: "Gross payment received",
    },
  ];

  // A zero share is simply not written. The ledger refuses zero amounts, and a
  // row saying nothing moved would be noise in a statement.
  if (!supplierCost.isZero()) {
    entries.push({
      ...sharedFields,
      account_type: "SUPPLIER_COST",
      amount: supplierCost.negated(),
      description: "Supplier cost",
    });
  }

  if (saleDto.affiliate && !commission.isZero()) {
    entries.push({
      ...sharedFields,
      account_type: "AFFILIATE_COMMISSION",
      // The outlet is owed this, not whoever owns the outlet today.
      owner_type: "STORE",
      owner_id: saleDto.affiliate.store_id,
      amount: commission.negated(),
      // The hold is the platform's chargeback defence; the length lives in
      // models/ledger so no caller picks its own.
      matures_at: ledger.maturityFor(),
      description: "Affiliate commission",
    });
  }

  if (!platformRevenue.isZero()) {
    entries.push({
      ...sharedFields,
      account_type: "PLATFORM_REVENUE",
      amount: platformRevenue.negated(),
      description: "Platform revenue",
    });
  }

  return await ledger.record(
    { source_type: "SALE", source_id: saleDto.sale_id, entries },
    { client: tx },
  );
}

// Resolve store_slug leniently: an absent or unknown store must never block
// acquisition — it just means the sale isn't attributed to a store.
//
// The outlet is the payee, so there is nothing else to resolve. Who owns it does
// not enter into it: an outlet keeps earning across a change of ownership, and
// the commission is owed to the outlet whether or not anyone currently holds it.
async function resolveAffiliateLeniently(
  storeSlug?: string,
): Promise<Affiliate | null> {
  if (!storeSlug) return null;

  try {
    const foundStore = await store.findOnePublishedBySlug(storeSlug);

    return { store_id: foundStore.id };
  } catch {
    return null;
  }
}

async function add(
  userId: string,
  itemId: string,
  itemType: ItemType = "GAME",
) {
  return await prisma.libraryItem.upsert({
    where: {
      user_id_item_id_item_type: {
        user_id: userId,
        item_id: itemId,
        item_type: itemType,
      },
    },
    update: {},
    create: {
      user_id: userId,
      item_id: itemId,
      item_type: itemType,
    },
  });
}

async function findAllPaginatedGamesByUserId(
  userId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;

  const [userLibraryItems, totalCount] = await Promise.all([
    prisma.libraryItem.findMany({
      where: {
        user_id: userId,
        item_type: "GAME",
      },
      orderBy: {
        acquired_at: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.libraryItem.count({
      where: {
        user_id: userId,
        item_type: "GAME",
      },
    }),
  ]);

  const gameIds = userLibraryItems.map((item) => item.item_id);

  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
    },
    orderBy: {
      title: "asc",
    },
  });

  const gamesWithLibraryInfo = userLibraryItems.map((item) => {
    const game = games.find((g) => g.id === item.item_id);
    return {
      ...item,
      game,
    };
  });

  return {
    games: gamesWithLibraryInfo,
    pagination: {
      total_items: totalCount,
      total_pages: Math.ceil(totalCount / limit),
      current_page: page,
      items_per_page: limit,
    },
  };
}

async function hasItem(
  userId: string,
  itemId: string,
  itemType: ItemType = "GAME",
): Promise<boolean> {
  const item = await prisma.libraryItem.findUnique({
    where: {
      user_id_item_id_item_type: {
        user_id: userId,
        item_id: itemId,
        item_type: itemType,
      },
    },
  });

  return !!item;
}

async function hasGameBySlug(userId: string, gameSlug: string) {
  const existingGame = await game.findOneBySlug(gameSlug);

  return existingGame ? hasItem(userId, existingGame.id, "GAME") : false;
}

const library = {
  add,
  hasItem,
  hasGameBySlug,
  findAllPaginatedGamesByUserId,
  acquireGame,
};

export default library;
