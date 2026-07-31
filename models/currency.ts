import { prisma } from "infra/database";
import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";

// ISO 4217: exactly three letters. Stored and compared uppercase so lookups
// never depend on how a caller happened to type the code.
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "code must be a 3-letter ISO 4217 currency code");

export const currencySchema = z.object({
  code: currencyCodeSchema,
  symbol: z.string().trim().min(1).max(8),
  decimal_places: z.coerce.number().int().min(0).max(4).default(2),
  enabled: z.boolean().default(true),
});

export type CurrencyCreateDto = z.infer<typeof currencySchema>;

// Code is immutable: it is the logical reference other tables point at, and
// with no foreign keys a rename would silently orphan every rate and override.
export const currencyUpdateSchema = z
  .object({
    symbol: z.string().trim().min(1).max(8).optional(),
    decimal_places: z.coerce.number().int().min(0).max(4).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CurrencyUpdateDto = z.infer<typeof currencyUpdateSchema>;

export const currencyAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  enabled: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

async function create(currencyDto: CurrencyCreateDto) {
  try {
    return await prisma.currency.create({
      data: currencyDto,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: `The currency "${currencyDto.code}" is already registered.`,
        action: "Use a different currency code or update the existing one.",
        cause: error,
      });
    }

    throw error;
  }
}

async function findOneByCode(code: string) {
  const foundCurrency = await prisma.currency.findUnique({
    where: { code: normalizeCode(code) },
  });

  if (!foundCurrency) {
    throw new NotFoundError({
      message: `The currency "${code}" was not found.`,
      action: "Check the currency code and try again.",
    });
  }

  return foundCurrency;
}

async function findAllEnabled() {
  return await prisma.currency.findMany({
    where: { enabled: true },
    orderBy: { code: "asc" },
  });
}

async function setEnabled(code: string, enabled: boolean) {
  return await update(code, { enabled });
}

async function update(code: string, updateDto: CurrencyUpdateDto) {
  const foundCurrency = await findOneByCode(code);

  return await prisma.currency.update({
    where: { id: foundCurrency.id },
    data: updateDto,
  });
}

// Admin listing: unlike findAllEnabled this returns disabled currencies too,
// since the backoffice has to be able to see and re-enable them.
async function findAllPaginated({
  page = 1,
  limit = 20,
  enabled,
}: {
  page?: number;
  limit?: number;
  enabled?: boolean;
} = {}) {
  const where: Prisma.CurrencyWhereInput = {};

  if (enabled !== undefined) {
    where.enabled = enabled;
  }

  const [currencies, total] = await Promise.all([
    prisma.currency.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.currency.count({ where }),
  ]);

  return {
    currencies,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

// Returns the subset of the given codes that are not registered, so callers
// writing several rows at once can validate in a single query instead of one
// lookup per code.
async function findUnregisteredCodes(codes: string[]) {
  const normalizedCodes = [...new Set(codes.map(normalizeCode))];

  const registeredCurrencies = await prisma.currency.findMany({
    where: { code: { in: normalizedCodes } },
    select: { code: true },
  });

  const registeredCodes = new Set(
    registeredCurrencies.map((currency) => currency.code),
  );

  return normalizedCodes.filter((code) => !registeredCodes.has(code));
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

const currency = {
  create,
  findOneByCode,
  findAllEnabled,
  findAllPaginated,
  setEnabled,
  update,
  findUnregisteredCodes,
  normalizeCode,
};

export default currency;
