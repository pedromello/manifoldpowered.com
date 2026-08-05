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

// Exchange rates are Decimal(19,8) and are refused past that scale for the same
// reason: a rate silently rounded on the way in no longer reproduces the amount
// it converted, which is exactly what the snapshot exists to allow.
const RATE_SCALE = 8;

// How long a commission is held after payment so refunds and chargebacks can
// resolve. This is a control the payment processor disclosure relies on
// (docs/legal/business-description.md), so it lives here rather than being
// picked separately by each caller that writes a commission.
export const COMMISSION_HOLD_DAYS = 30;

// Upper bounds, so an out-of-range amount fails as a ValidationError here
// instead of as a numeric overflow from Postgres. Decimal(19,4) leaves 15
// integer digits; these sit well inside that and match the ceilings already
// used by models/pricing and models/exchange_rate.
const MAX_AMOUNT = 1_000_000_000_000;
const MAX_RATE = 1_000_000_000;

// Descriptions are VarChar(255). A derived reversal description is truncated to
// fit rather than being allowed to overflow the column, which would surface as
// an unhandled Postgres 22001 rather than anything a caller could act on.
const MAX_DESCRIPTION_LENGTH = 255;

// Accounts that belong to a specific user. Every other account is the
// platform's own and must carry no owner: a CONSUMER_PAYMENT row naming a
// storefront owner would be a record asserting an affiliate received consumer
// funds, which is the single fact the affiliate characterisation depends on
// never being true (docs/legal/phase-0-checklist.md).
const OWNED_ACCOUNT_TYPES: LedgerAccountType[] = [
  LedgerAccountType.AFFILIATE_COMMISSION,
  LedgerAccountType.PAYOUT,
];

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

    if (amount.abs().greaterThan(MAX_AMOUNT)) {
      ctx.addIssue({
        code: "custom",
        message: `amount must be between -${MAX_AMOUNT} and ${MAX_AMOUNT}`,
      });
    }
  })
  .transform((value) => new Prisma.Decimal(value));

const ledgerExchangeRateSchema = z
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
      return;
    }

    if (rate.decimalPlaces() > RATE_SCALE) {
      ctx.addIssue({
        code: "custom",
        message: `exchange_rate must have at most ${RATE_SCALE} decimal places`,
      });
    }

    if (rate.greaterThan(MAX_RATE)) {
      ctx.addIssue({
        code: "custom",
        message: `exchange_rate must not exceed ${MAX_RATE}`,
      });
    }
  })
  .transform((value) => new Prisma.Decimal(value));

export const ledgerEntrySchema = z
  .object({
    // Taken from the generated enum rather than a hand-copied list, so adding
    // an account really is just ALTER TYPE plus a regenerate. A duplicated list
    // would leave the database accepting a value that record() then rejects.
    account_type: z.enum(LedgerAccountType),
    // Null for platform accounts, which belong to no user.
    owner_id: z.uuid().nullish().default(null),
    amount: ledgerAmountSchema,
    currency: currencyCodeSchema,
    exchange_rate: ledgerExchangeRateSchema.nullish().default(null),
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
  // Named for what it does: it only has an effect when matured_only is set.
  // A plain `as_of` would read like a point-in-time balance, which this model
  // cannot produce.
  matured_as_of?: Date;
}

// Totals a set of entries per currency. Pure, so a caller assembling a set can
// check it balances before attempting the write — and so the invariant itself
// is testable without a database.
function sumByCurrency(
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

  // Pure checks first: neither is worth a database round trip to discover.
  assertBalanced(entries);
  assertOwnershipMatchesAccounts(entries);

  await validateCurrenciesAreRecordable(
    entries.flatMap((entry) =>
      [entry.currency, entry.exchange_rate_from_currency].filter(
        (code): code is string => code !== null,
      ),
    ),
  );

  await validateOwnersExist(
    entries
      .map((entry) => entry.owner_id)
      .filter((ownerId): ownerId is string => ownerId !== null),
  );

  const entryGroupId = randomUUID();

  return await prisma.ledgerEntry.createManyAndReturn({
    data: entries.map((entry) => ({
      entry_group_id: entryGroupId,
      account_type: entry.account_type,
      owner_id: entry.owner_id,
      amount: entry.amount,
      // Already uppercased by currencyCodeSchema, on both this and the
      // exchange_rate_from_currency below.
      currency: entry.currency,
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

  // Reversing a reversal would reinstate the original set while leaving every
  // "has this been reversed" check still answering yes. A correction on top of
  // a correction is a new balanced set, not another mirror.
  if (originalEntries.some((entry) => entry.reverses_entry_id)) {
    throw new ValidationError({
      message: `The ledger entry group "${entryGroupId}" is itself a reversal and cannot be reversed.`,
      action:
        "Record a new balanced set to correct this, rather than reversing a reversal.",
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
    // Truncated, not left to overflow: an original sitting near the 255-char
    // limit would otherwise push the derived text past the column and fail the
    // whole reversal on a Postgres 22001.
    description: (
      description ?? `Reversal of ${entry.description ?? entry.account_type}`
    ).slice(0, MAX_DESCRIPTION_LENGTH),
  }));

  // Negating a balanced set cannot unbalance it, but the invariant is cheap to
  // re-check and this is the one place entries are written without going
  // through record().
  assertBalanced(reversalEntries);

  try {
    return await prisma.ledgerEntry.createManyAndReturn({
      data: reversalEntries,
    });
  } catch (error) {
    // The check above is read-then-write, so two concurrent chargeback
    // handlers can both find no reversal and both try to write one. The
    // unique index on reverses_entry_id is what actually stops the second.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: `The ledger entry group "${entryGroupId}" has already been reversed.`,
        action:
          "Record a new balanced set if a further correction is needed, rather than reversing this one twice.",
        cause: error,
      });
    }

    throw error;
  }
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
    matured_as_of = new Date(),
  }: BalanceOptions = {},
): Promise<CurrencyBalance[]> {
  // Prisma drops an undefined field from `where`, so a missing owner id would
  // silently widen this to every owner plus every platform row and return a
  // number that looks like a balance. strictNullChecks is off here, so nothing
  // upstream would have caught it.
  if (!ownerId) {
    throw new ValidationError({
      message: "An owner id is required to read a ledger balance.",
      action: "Pass the id of the user whose balance you want.",
    });
  }

  const where: Prisma.LedgerEntryWhereInput = {
    owner_id: ownerId,
    account_type,
  };

  if (matured_only) {
    // A null hold means the amount was never held in the first place, so it
    // has always been matured.
    where.OR = [{ matures_at: null }, { matures_at: { lte: matured_as_of } }];
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

// When a commission paid at `paidAt` becomes payable. The hold is the
// platform's chargeback defence, so the length lives in one constant rather
// than being restated by every caller that writes a commission entry.
//
// This answers "when is this safe to pay", which is independent of which
// statement period the payment eventually lands in — that is the payout run's
// decision and does not change this column.
function maturityFor(paidAt: Date = new Date()): Date {
  const maturesAt = new Date(paidAt.getTime());

  maturesAt.setUTCDate(maturesAt.getUTCDate() + COMMISSION_HOLD_DAYS);

  return maturesAt;
}

// The single place the sign is flipped for anything a person reads.
//
// The ledger stores what the platform holds, so a commission it owes is
// negative there. An affiliate looking at their statement expects the opposite,
// and a payout run expects to transfer a positive amount. Every such caller
// goes through here rather than negating by hand, because one call site
// forgetting to would pay backwards.
// Note the account_type option reads differently here: a negated PAYOUT balance
// means "already sent to them", not "owed to them". Only AFFILIATE_COMMISSION —
// the default — reads as a debt.
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

// What a payout run may actually pay: cleared its hold, and signed the way a
// person expects.
//
// This exists because the obvious name for that number is maturedBalancesFor,
// which returns the raw ledger sign — negative while owed. A payout run
// reaching for the obviously-named function and transferring a negative amount
// is the worst bug this model could ship, so the convenient name is also the
// safe one.
async function maturedPayableBalancesFor(
  ownerId: string,
  options: Omit<BalanceOptions, "matured_only"> = {},
): Promise<CurrencyBalance[]> {
  return await payableBalancesFor(ownerId, { ...options, matured_only: true });
}

async function findByGroup(entryGroupId: string) {
  return await prisma.ledgerEntry.findMany({
    where: { entry_group_id: entryGroupId },
    // Every row in a set shares one CURRENT_TIMESTAMP, so created_at alone is a
    // total tie and the returned order would be whatever the heap gives back.
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
}

// Everything ever written about one source, reversals included, since a
// reversal keeps the source of the set it cancels.
async function findBySource(sourceType: LedgerSourceType, sourceId: string) {
  return await prisma.ledgerEntry.findMany({
    where: { source_type: sourceType, source_id: sourceId },
    // Every row in a set shares one CURRENT_TIMESTAMP, so created_at alone is a
    // total tie and the returned order would be whatever the heap gives back.
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
}

// Whether anything written against this source was cancelled by reverse().
//
// This is introspection, not a payability test, and must not be used as one.
// It only sees corrections made through reverse() — a correction written as a
// fresh balanced ADJUSTMENT set carries no back-pointer and is invisible here.
// The number that is always right is the balance: a reversal negates the
// original and copies its matures_at, so a cancelled commission already nets to
// zero in maturedPayableBalancesFor without anyone having to ask this question.
async function isSourceReversed(
  sourceType: LedgerSourceType,
  sourceId: string,
) {
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

// Which accounts may name a user, and which must not.
//
// An owned account with no owner is a liability owed to nobody: balancesFor
// looks entries up by owner, so the row is invisible to every read path while
// still sitting in the books. An unowned account naming a user is worse — see
// OWNED_ACCOUNT_TYPES above.
function assertOwnershipMatchesAccounts(entries: ParsedLedgerEntry[]) {
  for (const entry of entries) {
    const isOwnedAccount = OWNED_ACCOUNT_TYPES.includes(entry.account_type);

    if (isOwnedAccount && !entry.owner_id) {
      throw new ValidationError({
        message: `A ${entry.account_type} entry must name the user it belongs to.`,
        action: "Set owner_id on this entry and try again.",
      });
    }

    if (!isOwnedAccount && entry.owner_id) {
      throw new ValidationError({
        message: `A ${entry.account_type} entry is a platform account and must not name a user.`,
        action: "Remove owner_id from this entry and try again.",
      });
    }
  }
}

// Same reasoning as the currency check below: with no foreign keys, an owner id
// that matches no user becomes a commission that never appears in any statement
// or payout, and nothing fails until someone notices the money is missing.
async function validateOwnersExist(ownerIds: string[]) {
  const uniqueIds = [...new Set(ownerIds)];

  if (uniqueIds.length === 0) {
    return;
  }

  const foundUsers = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });

  const foundIds = new Set(foundUsers.map((user) => user.id));
  const missingIds = uniqueIds.filter((ownerId) => !foundIds.has(ownerId));

  if (missingIds.length > 0) {
    throw new ValidationError({
      message: `The following ledger entry owners do not exist: ${missingIds.join(", ")}.`,
      action: "Check the owner_id of each entry and try again.",
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
  COMMISSION_HOLD_DAYS,
  record,
  reverse,
  maturityFor,
  balancesFor,
  balanceFor,
  maturedBalancesFor,
  payableBalancesFor,
  maturedPayableBalancesFor,
  findByGroup,
  findBySource,
  isSourceReversed,
  sumByCurrency,
};

export default ledger;
