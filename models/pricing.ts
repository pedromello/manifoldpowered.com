import { prisma } from "infra/database";
import { z } from "zod";
import { Game, Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import currency, { currencyCodeSchema } from "models/currency";
import exchangeRate from "models/exchange_rate";

// Every game carries a price in this currency, and prices in any other
// currency are derived from it.
export const BASE_CURRENCY = "USD";

export const gamePriceOverrideSchema = z.object({
  currency: currencyCodeSchema,
  amount: z.coerce.number().min(0).max(1_000_000),
});

export type GamePriceOverrideDto = z.infer<typeof gamePriceOverrideSchema>;

export interface ResolvedPrice {
  amount: Prisma.Decimal;
  currency: string;
  // Null when the price came from an override or is already in the base
  // currency. Set to the rate actually used otherwise, so a sale recorded from
  // this price can be reconciled later against the rate that produced it.
  exchange_rate: Prisma.Decimal | null;
  source: "BASE" | "OVERRIDE" | "CONVERTED";
}

async function setOverride(gameId: string, overrideDto: GamePriceOverrideDto) {
  await validateCurrencyIsUsable(overrideDto.currency);

  return await prisma.gamePriceOverride.upsert({
    where: {
      game_id_currency: {
        game_id: gameId,
        currency: currency.normalizeCode(overrideDto.currency),
      },
    },
    create: {
      game_id: gameId,
      currency: currency.normalizeCode(overrideDto.currency),
      amount: overrideDto.amount,
    },
    update: { amount: overrideDto.amount },
  });
}

async function removeOverride(gameId: string, currencyCode: string) {
  const normalizedCode = currency.normalizeCode(currencyCode);

  const deleted = await prisma.gamePriceOverride.deleteMany({
    where: { game_id: gameId, currency: normalizedCode },
  });

  if (deleted.count === 0) {
    throw new NotFoundError({
      message: `No ${normalizedCode} price override exists for this game.`,
      action: "Check the game and currency and try again.",
    });
  }

  return deleted;
}

async function listOverrides(gameId: string) {
  return await prisma.gamePriceOverride.findMany({
    where: { game_id: gameId },
    orderBy: { currency: "asc" },
  });
}

// Resolves what a game costs in a given currency:
//
//   priceFor(game, currency) = fixedOverride(game, currency)
//                           ?? convert(game.price, currency)
//
// Returns null when neither is available. Callers must treat null as "this
// product is not purchasable in this currency" and hide it, rather than
// falling back to the base currency — showing a price in the wrong currency is
// worse than showing nothing.
async function priceFor(
  game: Pick<Game, "id" | "price">,
  currencyCode: string,
  asOf: Date = new Date(),
): Promise<ResolvedPrice | null> {
  const normalizedCode = currency.normalizeCode(currencyCode);

  const isCurrencyUsable = await isUsable(normalizedCode);
  if (!isCurrencyUsable) {
    return null;
  }

  const override = await prisma.gamePriceOverride.findUnique({
    where: {
      game_id_currency: { game_id: game.id, currency: normalizedCode },
    },
  });

  if (override) {
    return {
      amount: override.amount,
      currency: normalizedCode,
      exchange_rate: null,
      source: "OVERRIDE",
    };
  }

  if (normalizedCode === BASE_CURRENCY) {
    return {
      amount: game.price,
      currency: BASE_CURRENCY,
      exchange_rate: null,
      source: "BASE",
    };
  }

  const rate = await exchangeRate.findLatest(
    BASE_CURRENCY,
    normalizedCode,
    asOf,
  );

  if (!rate) {
    return null;
  }

  return {
    amount: await roundToCurrencyScale(
      game.price.mul(rate.rate),
      normalizedCode,
    ),
    currency: normalizedCode,
    exchange_rate: rate.rate,
    source: "CONVERTED",
  };
}

// Same as priceFor but for callers that cannot render anything without a
// price, e.g. a checkout that has already committed to a currency.
async function priceForOrFail(
  game: Pick<Game, "id" | "price">,
  currencyCode: string,
  asOf: Date = new Date(),
) {
  const resolved = await priceFor(game, currencyCode, asOf);

  if (!resolved) {
    throw new NotFoundError({
      message: `This item has no price available in ${currency.normalizeCode(currencyCode)}.`,
      action:
        "Choose a different currency, or contact support if you expected this item to be available.",
    });
  }

  return resolved;
}

// The ids from `gameIds` that can be priced in the given currency.
//
// Cheap in the common case: every game has a base price, so once a rate exists
// for the pair the whole catalog is resolvable and no per-game lookup is
// needed. Only when the rate is missing does this fall back to "the games with
// an explicit override", which is exactly the set a storefront should show.
async function resolvableGameIds(
  gameIds: string[],
  currencyCode: string,
  asOf: Date = new Date(),
): Promise<string[]> {
  if (gameIds.length === 0) {
    return [];
  }

  const normalizedCode = currency.normalizeCode(currencyCode);

  if (!(await isUsable(normalizedCode))) {
    return [];
  }

  if (normalizedCode === BASE_CURRENCY) {
    return gameIds;
  }

  const rate = await exchangeRate.findLatest(
    BASE_CURRENCY,
    normalizedCode,
    asOf,
  );

  if (rate) {
    return gameIds;
  }

  const overrides = await prisma.gamePriceOverride.findMany({
    where: { game_id: { in: gameIds }, currency: normalizedCode },
    select: { game_id: true },
  });

  const overriddenIds = new Set(overrides.map((row) => row.game_id));

  return gameIds.filter((gameId) => overriddenIds.has(gameId));
}

// Storage keeps the full Decimal(19,4) scale; this rounds to what the currency
// actually displays. Half-up, matching how prices are quoted commercially.
// Prices with a commercial shape (49.90 rather than a converted 51.37) are set
// as overrides instead, keeping this a plain, auditable calculation.
async function roundToCurrencyScale(amount: Prisma.Decimal, code: string) {
  const foundCurrency = await currency.findOneByCode(code);

  return amount.toDecimalPlaces(
    foundCurrency.decimal_places,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

// A currency has to be both registered and enabled to be priced in. A disabled
// currency behaves exactly like an unknown one, so turning it off immediately
// removes it from every storefront.
async function isUsable(code: string) {
  const foundCurrency = await prisma.currency.findUnique({
    where: { code: currency.normalizeCode(code) },
    select: { enabled: true },
  });

  return Boolean(foundCurrency?.enabled);
}

async function validateCurrencyIsUsable(code: string) {
  if (!(await isUsable(code))) {
    throw new ValidationError({
      message: `The currency "${currency.normalizeCode(code)}" is not registered or is disabled.`,
      action: "Register and enable the currency before pricing in it.",
    });
  }
}

const pricing = {
  BASE_CURRENCY,
  setOverride,
  removeOverride,
  listOverrides,
  priceFor,
  priceForOrFail,
  resolvableGameIds,
  isUsable,
};

export default pricing;
