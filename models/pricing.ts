import { prisma } from "infra/database";
import { z } from "zod";
import { Game, Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import currency, { currencyCodeSchema } from "models/currency";
import exchangeRate from "models/exchange_rate";

// Every game carries a price in this currency, and prices in any other
// currency are derived from it.
export const BASE_CURRENCY = "USD";

// Used when the base currency has not been registered yet, so the storefront
// works before any currency is configured. A registered USD row always wins.
const BASE_CURRENCY_DEFAULTS = { symbol: "$", decimal_places: 2 };

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

  // The base currency resolves whether or not it has been registered, matching
  // displayPricesFor. Without this the two disagree: a storefront with no
  // currency rows shows a USD price — deliberately, so localisation stays
  // additive on a working default — while this function calls the same game
  // unpriceable, so it could be browsed but never bought.
  const isCurrencyUsable =
    normalizedCode === BASE_CURRENCY || (await isUsable(normalizedCode));

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

export interface GamePriceView {
  currency: string;
  // Null means the game is not purchasable in this currency and must be hidden
  // from anyone browsing in it.
  amount: string | null;
  source: "BASE" | "OVERRIDE" | "CONVERTED" | null;
  exchange_rate: string | null;
  is_override: boolean;
}

// One row per enabled currency, so whoever manages a game sees exactly what a
// buyer in each currency would see — including the currencies where the game
// is currently unavailable, which is the case most worth noticing.
async function priceViewFor(
  game: Pick<Game, "id" | "price">,
  asOf: Date = new Date(),
): Promise<GamePriceView[]> {
  const enabledCurrencies = await currency.findAllEnabled();

  return await Promise.all(
    enabledCurrencies.map(async (enabledCurrency) => {
      const resolved = await priceFor(game, enabledCurrency.code, asOf);

      return {
        currency: enabledCurrency.code,
        amount: resolved
          ? resolved.amount.toFixed(enabledCurrency.decimal_places)
          : null,
        source: resolved?.source ?? null,
        exchange_rate: resolved?.exchange_rate?.toFixed(8) ?? null,
        is_override: resolved?.source === "OVERRIDE",
      };
    }),
  );
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

export interface DisplayPrice {
  amount: string;
  // The "was" price, for a struck-through discount. Null when there is nothing
  // meaningful to compare against: an override states an absolute price with no
  // localised original, so showing the USD original beside it would misprice
  // the discount. Conversion preserves the ratio, so both sides convert.
  base_amount: string | null;
  currency: string;
  symbol: string;
}

// Prices a batch of games in one currency with a fixed number of queries: one
// for the currency, one for the rate, one for the overrides. Resolving each
// game individually would issue two queries per game, which on a 20-item
// storefront page is 40 round trips for information that does not vary.
//
// Games that cannot be priced are simply absent from the returned map. Callers
// must treat a missing entry as "not purchasable here" and hide the item —
// never fall back to the base currency, which would show a price in the wrong
// denomination.
async function displayPricesFor(
  games: Pick<Game, "id" | "price" | "base_price">[],
  currencyCode: string,
  asOf: Date = new Date(),
): Promise<Map<string, DisplayPrice>> {
  const prices = new Map<string, DisplayPrice>();

  if (games.length === 0) {
    return prices;
  }

  const normalizedCode = currency.normalizeCode(currencyCode);

  const registeredCurrency = await prisma.currency.findUnique({
    where: { code: normalizedCode },
  });

  // The base currency works without being registered. Localisation is purely
  // additive: with no currency rows at all the platform still sells in USD,
  // and registering currencies and rates only ever adds places to sell. The
  // alternative — treating an unregistered base currency as "unpriceable" —
  // would empty the entire storefront the moment this shipped unconfigured.
  const foundCurrency =
    registeredCurrency?.enabled === true
      ? registeredCurrency
      : normalizedCode === BASE_CURRENCY
        ? BASE_CURRENCY_DEFAULTS
        : null;

  if (!foundCurrency) {
    return prices;
  }

  const overrides = await prisma.gamePriceOverride.findMany({
    where: {
      game_id: { in: games.map((game) => game.id) },
      currency: normalizedCode,
    },
  });

  const overrideByGameId = new Map(
    overrides.map((override) => [override.game_id, override.amount]),
  );

  const rate =
    normalizedCode === BASE_CURRENCY
      ? null
      : await exchangeRate.findLatest(BASE_CURRENCY, normalizedCode, asOf);

  for (const game of games) {
    const override = overrideByGameId.get(game.id);

    const amount =
      override ??
      (normalizedCode === BASE_CURRENCY
        ? game.price
        : rate
          ? game.price
              .mul(rate.rate)
              .toDecimalPlaces(
                foundCurrency.decimal_places,
                Prisma.Decimal.ROUND_HALF_UP,
              )
          : null);

    if (amount === null) {
      continue;
    }

    // An override has no localised "was" price, so no discount is shown.
    const baseAmount =
      override || !game.base_price
        ? null
        : normalizedCode === BASE_CURRENCY
          ? game.base_price
          : rate
            ? game.base_price
                .mul(rate.rate)
                .toDecimalPlaces(
                  foundCurrency.decimal_places,
                  Prisma.Decimal.ROUND_HALF_UP,
                )
            : null;

    const formattedAmount = amount.toFixed(foundCurrency.decimal_places);
    const formattedBase = baseAmount
      ? baseAmount.toFixed(foundCurrency.decimal_places)
      : null;

    prices.set(game.id, {
      amount: formattedAmount,
      // Equal means no discount, so there is nothing to strike through.
      base_amount: formattedBase === formattedAmount ? null : formattedBase,
      currency: normalizedCode,
      symbol: foundCurrency.symbol,
    });
  }

  return prices;
}

// The id constraint a storefront query needs so unpriceable games never enter
// the result set in the first place.
//
// Returns null when no constraint is needed — the common case, since every
// game has a base price and one rate makes the whole catalogue priceable.
// Filtering after the query instead would corrupt pagination: a page of 20
// could silently render 15.
async function priceableGameIdConstraint(
  currencyCode: string,
  asOf: Date = new Date(),
): Promise<string[] | null> {
  const normalizedCode = currency.normalizeCode(currencyCode);

  // Mirrors displayPricesFor: the base currency needs no registration, so the
  // catalogue is fully priceable before anything is configured.
  if (normalizedCode === BASE_CURRENCY) {
    return null;
  }

  if (!(await isUsable(normalizedCode))) {
    return [];
  }

  const rate = await exchangeRate.findLatest(
    BASE_CURRENCY,
    normalizedCode,
    asOf,
  );

  if (rate) {
    return null;
  }

  // No rate: only games explicitly priced in this currency are purchasable.
  const overrides = await prisma.gamePriceOverride.findMany({
    where: { currency: normalizedCode },
    select: { game_id: true },
  });

  return overrides.map((override) => override.game_id);
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
  priceViewFor,
  displayPricesFor,
  priceableGameIdConstraint,
  resolvableGameIds,
  isUsable,
};

export default pricing;
