import { prisma } from "infra/database";
import { z } from "zod";
import { Game, Prisma, Store } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";

// Rates are fractions of the gross sale amount, stored at the same scale as an
// exchange rate. Four decimals would round 0.0725 fine but not 0.06125, and a
// commission silently rounded is a commission argued about later.
const RATE_SCALE = 8;

// What an outlet earns on a sale it referred, when no bespoke rate is set.
//
// Deliberately a fraction of the GROSS sale, not of the margin left after
// supplier cost. That is a commercial decision, not an arithmetic one: it makes
// an affiliate's earnings depend only on the price a buyer saw, which is the
// number they can actually verify.
//
// Note this diverges from docs/legal/storefront-owner-agreement-termsheet.md,
// which still describes commission as a percentage of net. The term sheet needs
// updating to match; until it does, the agreement and the code disagree.
export const DEFAULT_COMMISSION_RATE = new Prisma.Decimal("0.10");

// The kinds of supplier the platform can owe money to. A Studio supplies the
// games in the catalogue; an integration (a gift-card distributor) will supply
// codes. Extending this list is a commercial event and costs no migration,
// which is why SupplierTerms.supplier_type is a string column rather than an
// enum.
export const SUPPLIER_TYPES = ["STUDIO", "INTEGRATION"] as const;

export type SupplierType = (typeof SUPPLIER_TYPES)[number];

// Defaults by supplier kind, applied when a supplier has no terms of its own.
//
// INTEGRATION deliberately has none. A studio-supplied game has a house rate
// that has always applied, but an integration's cost comes from a negotiated
// contract — assuming one would mean booking a margin nobody agreed to, so an
// unconfigured integration fails loudly instead.
export const DEFAULT_SUPPLIER_COST_RATES: Partial<
  Record<SupplierType, Prisma.Decimal>
> = {
  STUDIO: new Prisma.Decimal("0.70"),
};

function isDecimalLike(value: number | string) {
  try {
    new Prisma.Decimal(value);
    return true;
  } catch {
    return false;
  }
}

// A share of a sale, so it cannot be negative and cannot exceed the whole.
// Validated on the raw input with the transform last, so the schema's input
// type stays number | string — see the same note in models/ledger.
const rateSchema = z
  .union([z.number(), z.string()])
  .superRefine((value, ctx) => {
    if (!isDecimalLike(value)) {
      ctx.addIssue({ code: "custom", message: "rate must be a number" });
      return;
    }

    const rate = new Prisma.Decimal(value);

    if (!rate.isFinite()) {
      ctx.addIssue({ code: "custom", message: "rate must be finite" });
      return;
    }

    if (rate.lessThan(0) || rate.greaterThan(1)) {
      ctx.addIssue({
        code: "custom",
        message: "rate must be between 0 and 1",
      });
    }

    // Refused rather than rounded, matching how the ledger treats an over-scale
    // amount: a rate quietly trimmed on the way in no longer reproduces the
    // commission it was used to calculate.
    if (rate.decimalPlaces() > RATE_SCALE) {
      ctx.addIssue({
        code: "custom",
        message: `rate must have at most ${RATE_SCALE} decimal places`,
      });
    }
  })
  .transform((value) => new Prisma.Decimal(value));

export const commissionRateSchema = z.object({
  // Null clears the bespoke rate and returns the outlet to the platform
  // default, which is a different intent from setting it to zero.
  commission_rate: rateSchema.nullable(),
});

export const supplierTermsSchema = z.object({
  supplier_type: z.enum(SUPPLIER_TYPES),
  supplier_id: z.uuid(),
  cost_rate: rateSchema,
});

// Spelled out rather than inferred from the schema. This project compiles with
// strictNullChecks off, and Zod decides a piped schema's key is optional by
// asking whether `undefined` extends its output — which is true of everything
// under that setting, so `cost_rate` would come back optional despite the
// schema requiring it. Same reason models/ledger declares ParsedLedgerEntry.
export interface SupplierTermsDto {
  supplier_type: SupplierType;
  supplier_id: string;
  cost_rate: Prisma.Decimal;
}

export const supplierTermsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  supplier_type: z.enum(SUPPLIER_TYPES).optional(),
});

// What the outlet that referred a sale earns, as a fraction of the gross.
function commissionRateFor(
  storeRow: Pick<Store, "commission_rate">,
): Prisma.Decimal {
  return storeRow.commission_rate ?? DEFAULT_COMMISSION_RATE;
}

// What the supplier of this game keeps, as a fraction of the gross.
//
// A game's supplier is its studio. When gift cards arrive their supplier will
// be an integration, resolved through the same two-column reference, and this
// function grows a branch rather than the table growing a column.
async function supplierCostRateFor(
  gameRow: Pick<Game, "studio_id">,
): Promise<Prisma.Decimal> {
  return await costRateFor("STUDIO", gameRow.studio_id);
}

async function costRateFor(
  supplierType: SupplierType,
  supplierId: string,
): Promise<Prisma.Decimal> {
  const terms = await findSupplierTerms(supplierType, supplierId);

  if (terms) {
    return terms.cost_rate;
  }

  const defaultRate = DEFAULT_SUPPLIER_COST_RATES[supplierType];

  if (!defaultRate) {
    throw new ValidationError({
      message: `No cost rate is configured for the ${supplierType} supplier "${supplierId}".`,
      action: "Set supplier terms for this supplier and try again.",
    });
  }

  return defaultRate;
}

async function findSupplierTerms(
  supplierType: SupplierType,
  supplierId: string,
) {
  return await prisma.supplierTerms.findUnique({
    where: {
      supplier_type_supplier_id: {
        supplier_type: supplierType,
        supplier_id: supplierId,
      },
    },
  });
}

// Upsert rather than create: a supplier has one set of terms at a time, and
// re-agreeing a rate is the ordinary case rather than an error.
async function setSupplierTerms(termsDto: SupplierTermsDto) {
  await validateSupplierExists(termsDto.supplier_type, termsDto.supplier_id);

  return await prisma.supplierTerms.upsert({
    where: {
      supplier_type_supplier_id: {
        supplier_type: termsDto.supplier_type,
        supplier_id: termsDto.supplier_id,
      },
    },
    create: termsDto,
    update: { cost_rate: termsDto.cost_rate },
  });
}

async function findAllSupplierTermsPaginated({
  page = 1,
  limit = 20,
  supplier_type,
}: {
  page?: number;
  limit?: number;
  supplier_type?: SupplierType;
} = {}) {
  const where: Prisma.SupplierTermsWhereInput = {};

  if (supplier_type) {
    where.supplier_type = supplier_type;
  }

  const [terms, total] = await Promise.all([
    prisma.supplierTerms.findMany({
      where,
      orderBy: [{ supplier_type: "asc" }, { created_at: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supplierTerms.count({ where }),
  ]);

  return {
    terms,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

// Kept out of store.update on purpose. That function re-parses the store
// through storeSchema and regenerates the slug from the name, which is a lot of
// unrelated machinery to run in order to change one number — and it is the
// owner-facing path, which must never be able to reach this column.
async function setCommissionRate(
  storeId: string,
  commissionRate: Prisma.Decimal | null,
) {
  return await prisma.store.update({
    where: { id: storeId },
    data: { commission_rate: commissionRate },
  });
}

// No foreign keys, so a supplier id that matches nothing would become terms
// that silently never apply to anything.
async function validateSupplierExists(
  supplierType: SupplierType,
  supplierId: string,
) {
  if (supplierType !== "STUDIO") {
    // Integrations have no table to check against yet. When one exists this
    // grows a branch; until then the type itself is the only validation.
    return;
  }

  const foundStudio = await prisma.studio.findUnique({
    where: { id: supplierId },
    select: { id: true },
  });

  if (!foundStudio) {
    throw new NotFoundError({
      message: `No studio was found for the supplier id "${supplierId}".`,
      action: "Check the supplier id and try again.",
    });
  }
}

const commercialTerms = {
  DEFAULT_COMMISSION_RATE,
  DEFAULT_SUPPLIER_COST_RATES,
  SUPPLIER_TYPES,
  commissionRateFor,
  supplierCostRateFor,
  costRateFor,
  findSupplierTerms,
  setSupplierTerms,
  findAllSupplierTermsPaginated,
  setCommissionRate,
};

export default commercialTerms;
