import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { z } from "zod";
import { LedgerAccountType, Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import currency, { currencyCodeSchema } from "models/currency";
import { BASE_CURRENCY } from "models/pricing";

// Storage is Decimal(19,4). Amounts are rejected rather than rounded when they
// carry more scale than this, because rounding at write time can turn a set
// that validated as balanced into one that lands unbalanced — the exact class
// of bug the zero-sum rule exists to catch.
const MONEY_SCALE = 4;

const ledgerAccountTypeValues = [
  "CONSUMER_PAYMENT",
  "SUPPLIER_COST",
  "AFFILIATE_COMMISSION",
  "PLATFORM_REVENUE",
  "PAYOUT",
] as const;

// What a set of entries can point at. A plain string column rather than an
// enum, so pointing at an Order once checkout exists costs no migration. The
// list is enforced here instead, which is where referential integrity lives in
// a schema with no foreign keys.
export const LEDGER_SOURCE_TYPES = ["SALE", "PAYOUT", "ADJUSTMENT"] as const;

export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

// What a caller may hand us for a money amount or a rate.
export type DecimalInput = Prisma.Decimal | number | string;

function isDecimalLike(value: number | string) {
  try {
    new Prisma.Decimal(value);
    return true;
  } catch {
    return false;
  }
}

// A Prisma.Decimal is accepted from callers but converted to its string form
// before validation. Putting the class itself into a Zod union widens the
// inferred input to `unknown`, which makes every field alongside it look
// optional — so the conversion happens here and the schemas stay over
// number | string.
function toDecimalInput(value: unknown) {
  return value instanceof Prisma.Decimal ? value.toFixed() : value;
}

// Validation happens on the raw input and the transform comes last, so the
// schema's input type stays number | string. Ending on a refine instead would
// leave Zod unable to infer that input, and every field sharing the object
// with it would silently become optional.
const ledgerAmountSchema = z
  .union([z.number(), z.string()])
  .superRefine((value, ctx) => {
    if (!isDecimalLike(value)) {
      ctx.addIssue({ code: "custom", message: "amount must be a number" });
      return;
    }

    const amount = new Prisma.Decimal(value);

    if (!amount.isFinite()) {
      ctx.addIssue({ code: "custom", message: "amount must be finite" });
      return;
    }

    // A zero entry is trivially balanced and moves nothing, so it is always a
    // mistake — usually a commission that should not have been written at all.
    if (amount.isZero()) {
      ctx.addIssue({ code: "custom", message: "amount must not be zero" });
    }

    if (amount.decimalPlaces() > MONEY_SCALE) {
      ctx.addIssue({
        code: "custom",
        message: `amount must have at most ${MONEY_SCALE} decimal places`,
      });
    }
  })
  .transform((value) => new Prisma.Decimal(value));

const exchangeRateSchema = z
  .union([z.number(), z.string()])
  .superRefine((value, ctx) => {
    if (!isDecimalLike(value)) {
      ctx.addIssue({
        code: "custom",
        message: "exchange_rate must be a number",
      });
      return;
    }

    const rate = new Prisma.Decimal(value);

    if (!rate.isFinite() || !rate.isPositive()) {
      ctx.addIssue({
        code: "custom",
        message: "exchange_rate must be a positive number",
      });
    }
  })
  .transform((value) => new Prisma.Decimal(value));

export const ledgerEntrySchema = z
  .object({
    account_type: z.enum(ledgerAccountTypeValues),
    // Null for platform accounts, which belong to no user.
    owner_id: z.uuid().nullish().default(null),
    amount: ledgerAmountSchema,
    currency: currencyCodeSchema,
    exchange_rate: exchangeRateSchema.nullish().default(null),
    exchange_rate_from_currency: currencyCodeSchema.nullish().default(null),
    // Null means the amount is available immediately, with no hold.
    matures_at: z.coerce.date().nullish().default(null),
    description: z.string().trim().min(1).max(255).nullish().default(null),
  })
  .refine(
    (entry) =>
      (entry.exchange_rate === null) ===
      (entry.exchange_rate_from_currency === null),
    {
      message:
        "exchange_rate and exchange_rate_from_currency must be set together",
      path: ["exchange_rate"],
    },
  )
  .refine((entry) => entry.exchange_rate_from_currency !== entry.currency, {
    message: "exchange_rate_from_currency must differ from currency",
    path: ["exchange_rate_from_currency"],
  });

// Widened from the schema's input so callers can pass the Prisma.Decimal they
// already hold — a converted price, a commission from .mul() — without
// stringifying it first.
export type LedgerEntryDto = Omit<
  z.input<typeof ledgerEntrySchema>,
  "amount" | "exchange_rate"
> & {
  amount: DecimalInput;
  exchange_rate?: DecimalInput | null;
};

export const recordLedgerEntriesSchema = z.object({
  source_type: z.enum(LEDGER_SOURCE_TYPES),
  source_id: z.string().trim().min(1),
  // Every entry in a set must balance against the others, and a single entry
  // can only do that by being zero — which is already rejected above.
  entries: z
    .array(ledgerEntrySchema)
    .min(2, "a balanced set needs at least two entries"),
});

export interface RecordLedgerEntriesDto {
  source_type: LedgerSourceType;
  source_id: string;
  entries: LedgerEntryDto[];
}

// What the schema produces once parsed. Spelled out rather than inferred:
// this project compiles with strictNullChecks off, and Zod decides a piped
// schema's key is optional by asking whether `undefined` extends its output —
// which is true of everything under that setting. `amount` would come back
// optional despite the schema requiring it, so the shape is declared here and
// the parse result is narrowed to it.
interface ParsedLedgerEntry {
  account_type: LedgerAccountType;
  owner_id: string | null;
  amount: Prisma.Decimal;
  currency: string;
  exchange_rate: Prisma.Decimal | null;
  exchange_rate_from_currency: string | null;
  matures_at: Date | null;
  description: string | null;
}

export interface CurrencyBalance {
  currency: string;
  amount: Prisma.Decimal;
}

interface BalanceOptions {
  // Defaults to the commission account because that is the only balance an
  // affiliate holds. Pass PAYOUT to see what has been settled to them instead.
  account_type?: LedgerAccountType;
  matured_only?: boolean;
  as_of?: Date;
}

// Totals a set of entries per currency. Pure, so a caller assembling a set can
// check it balances before attempting the write — and so the invariant itself
// is testable without a database.
export function sumByCurrency(
  entries: Array<{ amount: Prisma.Decimal; currency: string }>,
): Map<string, Prisma.Decimal> {
  const totals = new Map<string, Prisma.Decimal>();

  for (const entry of entries) {
    const normalizedCode = currency.normalizeCode(entry.currency);
    const runningTotal = totals.get(normalizedCode) ?? new Prisma.Decimal(0);

    totals.set(normalizedCode, runningTotal.add(entry.amount));
  }

  return totals;
}

// Writes one balanced set of entries. The set is rejected unless it sums to
// zero within every currency it touches, which is what makes the ledger
// auditable: money is never created or destroyed by a write, only moved, and a
// bug that loses money fails here rather than in a payout weeks later.
//
// Currencies are never mixed in a single sum. A set spanning BRL and USD must
// balance in each independently — the conversion between them is itself a pair
// of entries carrying the rate that produced it.
async function record(recordDto: RecordLedgerEntriesDto) {
  const result = recordLedgerEntriesSchema.safeParse({
    ...recordDto,
    entries: (recordDto.entries ?? []).map((entry) => ({
      ...entry,
      amount: toDecimalInput(entry.amount),
      exchange_rate: toDecimalInput(entry.exchange_rate),
    })),
  });

  if (!result.success) {
    throw new ValidationError({
      message: "One or more ledger entries are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { source_type, source_id } = result.data;
  const entries = result.data.entries as ParsedLedgerEntry[];

  // Balance first: it is pure, and an unbalanced set is never worth a database
  // round trip to check its currencies.
  assertBalanced(entries);

  await validateCurrenciesAreRecordable(
    entries.flatMap((entry) =>
      [entry.currency, entry.exchange_rate_from_currency].filter(
        (code): code is string => code !== null,
      ),
    ),
  );

  const entryGroupId = randomUUID();

  return await prisma.ledgerEntry.createManyAndReturn({
    data: entries.map((entry) => ({
      entry_group_id: entryGroupId,
      account_type: entry.account_type,
      owner_id: entry.owner_id,
      amount: entry.amount,
      currency: currency.normalizeCode(entry.currency),
      exchange_rate: entry.exchange_rate,
      exchange_rate_from_currency: entry.exchange_rate_from_currency,
      source_type,
      source_id,
      matures_at: entry.matures_at,
      description: entry.description,
    })),
  });
}

// Undoes a set by writing its mirror image, never by touching the original.
// History stays intact and the reversal is itself auditable: the two sets
// together sum to zero, and every new row names the row it cancels.
//
// The reversal keeps the original's source, currency, rate snapshot and
// matures_at. Copying matures_at is what makes a clawback work — a null there
// would count the reversal as immediately available while the original was
// still held, so a matured-balance query would show the commission as payable
// with nothing offsetting it.
async function reverse(
  entryGroupId: string,
  { description }: { description?: string } = {},
) {
  const originalEntries = await findByGroup(entryGroupId);

  if (originalEntries.length === 0) {
    throw new NotFoundError({
      message: `No ledger entries were found for the group "${entryGroupId}".`,
      action: "Check the entry group id and try again.",
    });
  }

  const alreadyReversed = await prisma.ledgerEntry.findFirst({
    where: {
      reverses_entry_id: { in: originalEntries.map((entry) => entry.id) },
    },
  });

  if (alreadyReversed) {
    throw new ValidationError({
      message: `The ledger entry group "${entryGroupId}" has already been reversed.`,
      action:
        "Record a new balanced set if a further correction is needed, rather than reversing this one twice.",
    });
  }

  const reversalGroupId = randomUUID();

  const reversalEntries = originalEntries.map((entry) => ({
    entry_group_id: reversalGroupId,
    account_type: entry.account_type,
    owner_id: entry.owner_id,
    amount: entry.amount.negated(),
    currency: entry.currency,
    exchange_rate: entry.exchange_rate,
    exchange_rate_from_currency: entry.exchange_rate_from_currency,
    source_type: entry.source_type,
    source_id: entry.source_id,
    matures_at: entry.matures_at,
    reverses_entry_id: entry.id,
    description:
      description ?? `Reversal of ${entry.description ?? entry.account_type}`,
  }));

  // Negating a balanced set cannot unbalance it, but the invariant is cheap to
  // re-check and this is the one place entries are written without going
  // through record().
  assertBalanced(reversalEntries);

  return await prisma.ledgerEntry.createManyAndReturn({
    data: reversalEntries,
  });
}

// Signed balances straight from the ledger, one row per currency. Never summed
// across currencies: an affiliate can hold a BRL balance and a USD balance at
// once and they are not comparable, let alone addable.
//
// Under the sign convention these are negative while the platform owes them.
// Use payableBalancesFor for anything user-facing.
async function balancesFor(
  ownerId: string,
  {
    account_type = LedgerAccountType.AFFILIATE_COMMISSION,
    matured_only = false,
    as_of = new Date(),
  }: BalanceOptions = {},
): Promise<CurrencyBalance[]> {
  const where: Prisma.LedgerEntryWhereInput = {
    owner_id: ownerId,
    account_type,
  };

  if (matured_only) {
    // A null hold means the amount was never held in the first place, so it
    // has always been matured.
    where.OR = [{ matures_at: null }, { matures_at: { lte: as_of } }];
  }

  const grouped = await prisma.ledgerEntry.groupBy({
    by: ["currency"],
    where,
    _sum: { amount: true },
    orderBy: { currency: "asc" },
  });

  return grouped.map((row) => ({
    currency: row.currency,
    amount: row._sum.amount ?? new Prisma.Decimal(0),
  }));
}

// The signed balance in one currency. Zero when the owner has no entries in it,
// so callers never have to distinguish "no rows" from "nets to nothing".
async function balanceFor(
  ownerId: string,
  currencyCode: string,
  options: BalanceOptions = {},
): Promise<Prisma.Decimal> {
  const normalizedCode = currency.normalizeCode(currencyCode);
  const balances = await balancesFor(ownerId, options);

  return (
    balances.find((balance) => balance.currency === normalizedCode)?.amount ??
    new Prisma.Decimal(0)
  );
}

// Only what has cleared its hold. This is the number a payout run may pay
// against; the rest is still inside the window where a refund or chargeback
// can take it back.
async function maturedBalancesFor(
  ownerId: string,
  options: Omit<BalanceOptions, "matured_only"> = {},
): Promise<CurrencyBalance[]> {
  return await balancesFor(ownerId, { ...options, matured_only: true });
}

// The single place the sign is flipped for anything a person reads.
//
// The ledger stores what the platform holds, so a commission it owes is
// negative there. An affiliate looking at their statement expects the opposite,
// and a payout run expects to transfer a positive amount. Every such caller
// goes through here rather than negating by hand, because one call site
// forgetting to would pay backwards.
async function payableBalancesFor(
  ownerId: string,
  options: BalanceOptions = {},
): Promise<CurrencyBalance[]> {
  const balances = await balancesFor(ownerId, options);

  return balances.map((balance) => ({
    currency: balance.currency,
    amount: balance.amount.negated(),
  }));
}

async function findByGroup(entryGroupId: string) {
  return await prisma.ledgerEntry.findMany({
    where: { entry_group_id: entryGroupId },
    orderBy: { created_at: "asc" },
  });
}

// Everything ever written about one source, reversals included, since a
// reversal keeps the source of the set it cancels.
async function findBySource(sourceType: string, sourceId: string) {
  return await prisma.ledgerEntry.findMany({
    where: { source_type: sourceType, source_id: sourceId },
    orderBy: { created_at: "asc" },
  });
}

// Whether anything written against this source has since been reversed. The
// maturation job uses this to decide a commission is safe to pay.
async function isSourceReversed(sourceType: string, sourceId: string) {
  const reversal = await prisma.ledgerEntry.findFirst({
    where: {
      source_type: sourceType,
      source_id: sourceId,
      reverses_entry_id: { not: null },
    },
    select: { id: true },
  });

  return reversal !== null;
}

// The invariant. Every currency in the set must net to exactly zero.
function assertBalanced(
  entries: Array<{ amount: Prisma.Decimal; currency: string }>,
) {
  const totals = sumByCurrency(entries);

  const unbalanced = [...totals.entries()]
    .filter(([, total]) => !total.isZero())
    .map(([code, total]) => `${code} ${total.toFixed(MONEY_SCALE)}`);

  if (unbalanced.length > 0) {
    throw new ValidationError({
      message: `Ledger entries must sum to zero within each currency, but this set left ${unbalanced.join(", ")}.`,
      action:
        "Add the missing entries so every currency in the set nets to zero, and try again.",
    });
  }
}

// No foreign keys, so a currency code that matches nothing would become a row
// that silently never appears in any balance.
//
// The base currency is accepted whether or not it has been registered, exactly
// as models/pricing treats it. The platform sells in USD before any currency
// is configured, so a ledger that refused to record those sales would make an
// unconfigured install unable to write a single entry. A registered but
// disabled currency is fine too: turning a currency off stops us pricing in it,
// it does not un-happen the sales already made in it.
async function validateCurrenciesAreRecordable(codes: string[]) {
  const codesToCheck = codes.filter(
    (code) => currency.normalizeCode(code) !== BASE_CURRENCY,
  );

  const unregisteredCodes = await currency.findUnregisteredCodes(codesToCheck);

  if (unregisteredCodes.length > 0) {
    throw new ValidationError({
      message: `The following currencies are not registered: ${unregisteredCodes.join(", ")}.`,
      action: "Register the currency before recording ledger entries in it.",
    });
  }
}

const ledger = {
  LEDGER_SOURCE_TYPES,
  record,
  reverse,
  balancesFor,
  balanceFor,
  maturedBalancesFor,
  payableBalancesFor,
  findByGroup,
  findBySource,
  isSourceReversed,
  sumByCurrency,
};

export default ledger;
