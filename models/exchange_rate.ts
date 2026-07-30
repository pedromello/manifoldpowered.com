import { prisma } from "infra/database";
import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import currency, { currencyCodeSchema } from "models/currency";

const exchangeRateSourceValues = ["AUTOMATIC", "BULK", "MANUAL"] as const;

export const exchangeRateSchema = z
  .object({
    base_currency: currencyCodeSchema,
    quote_currency: currencyCodeSchema,
    // Rates are stored at Decimal(19,8): a coarser scale loses meaningful
    // precision on low-value currencies, where a single unit of the base
    // currency can be worth thousands of the quote.
    rate: z.coerce.number().positive().max(1_000_000_000),
    source: z.enum(exchangeRateSourceValues),
    effective_at: z.coerce.date().default(() => new Date()),
  })
  .refine((data) => data.base_currency !== data.quote_currency, {
    message: "base_currency and quote_currency must be different",
    path: ["quote_currency"],
  });

export type ExchangeRateCreateDto = z.infer<typeof exchangeRateSchema>;

async function record(rateDto: ExchangeRateCreateDto) {
  await validateCurrenciesAreRegistered([
    rateDto.base_currency,
    rateDto.quote_currency,
  ]);

  return await prisma.exchangeRate.create({
    data: rateDto,
  });
}

// Bulk path for the "rates agreed in advance" case. Writes in a single
// transaction so a partially loaded set never becomes visible to price
// resolution.
async function recordMany(rateDtos: ExchangeRateCreateDto[]) {
  if (rateDtos.length === 0) {
    throw new ValidationError({
      message: "No exchange rates were provided.",
      action: "Send at least one exchange rate to record.",
    });
  }

  await validateCurrenciesAreRegistered(
    rateDtos.flatMap((rateDto) => [
      rateDto.base_currency,
      rateDto.quote_currency,
    ]),
  );

  return await prisma.$transaction(
    rateDtos.map((rateDto) => prisma.exchangeRate.create({ data: rateDto })),
  );
}

// The newest rate that was already in effect at `asOf`. Rows effective in the
// future are ignored, so scheduling a rate ahead of time never changes how
// today's prices are converted.
async function findLatest(
  baseCurrency: string,
  quoteCurrency: string,
  asOf: Date = new Date(),
) {
  return await prisma.exchangeRate.findFirst({
    where: {
      base_currency: currency.normalizeCode(baseCurrency),
      quote_currency: currency.normalizeCode(quoteCurrency),
      effective_at: { lte: asOf },
    },
    orderBy: [{ effective_at: "desc" }, { created_at: "desc" }],
  });
}

// Same as findLatest but for callers that cannot proceed without a rate.
async function findLatestOrFail(
  baseCurrency: string,
  quoteCurrency: string,
  asOf: Date = new Date(),
) {
  const foundRate = await findLatest(baseCurrency, quoteCurrency, asOf);

  if (!foundRate) {
    throw new NotFoundError({
      message: `No exchange rate is available from ${currency.normalizeCode(baseCurrency)} to ${currency.normalizeCode(quoteCurrency)}.`,
      action: "Record an exchange rate for this currency pair and try again.",
    });
  }

  return foundRate;
}

async function listByPair(
  baseCurrency: string,
  quoteCurrency: string,
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {},
) {
  const where: Prisma.ExchangeRateWhereInput = {
    base_currency: currency.normalizeCode(baseCurrency),
    quote_currency: currency.normalizeCode(quoteCurrency),
  };

  const [rates, total] = await Promise.all([
    prisma.exchangeRate.findMany({
      where,
      orderBy: { effective_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.exchangeRate.count({ where }),
  ]);

  return {
    rates,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

// There are no foreign keys in this schema, so referential integrity for
// currency codes is enforced here instead. Without it a typo becomes a rate
// that silently never matches anything.
async function validateCurrenciesAreRegistered(codes: string[]) {
  const unregisteredCodes = await currency.findUnregisteredCodes(codes);

  if (unregisteredCodes.length > 0) {
    throw new ValidationError({
      message: `The following currencies are not registered: ${unregisteredCodes.join(", ")}.`,
      action: "Register the currency before recording an exchange rate for it.",
    });
  }
}

const exchangeRate = {
  record,
  recordMany,
  findLatest,
  findLatestOrFail,
  listByPair,
};

export default exchangeRate;
