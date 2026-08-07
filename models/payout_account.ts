import { prisma } from "infra/database";
import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import currency, { currencyCodeSchema } from "models/currency";
import pricing from "models/pricing";

// The rails we can pay an outlet through.
//
// A plain list rather than an enum column for the same reason
// SupplierTerms.supplier_type is a string: onboarding a payout provider is a
// commercial event, not a schema change. This becomes the provider registry's
// key set once the provider interface lands, and this constant goes away in
// favour of the registry's own keys.
export const PAYOUT_PROVIDERS = ["STRIPE"] as const;

export type PayoutProvider = (typeof PAYOUT_PROVIDERS)[number];

// What an outlet may say about its own payout account.
//
// payouts_enabled and provider_account_id are absent by design, not by
// omission: the party being paid must not be able to declare itself payable,
// and the external account id is the provider's to issue. Both are written
// only through setProviderState below.
export const payoutAccountSchema = z.object({
  provider: z.enum(PAYOUT_PROVIDERS),
  payout_currency: currencyCodeSchema,
  label: z.string().trim().max(255).optional(),
});

export type PayoutAccountDto = z.infer<typeof payoutAccountSchema>;

// Null clears the label, which is a different intent from omitting it. Every
// key is optional, so an empty body would otherwise be a silent no-op returning
// 200 — refused instead, because a caller sending nothing meant something.
export const payoutAccountUpdateSchema = payoutAccountSchema
  .partial()
  .extend({ label: z.string().trim().max(255).nullable().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field must be provided",
  });

export type PayoutAccountUpdateDto = z.infer<typeof payoutAccountUpdateSchema>;

// A payout currency has to be one we can actually pay in, which means the
// registry has to know about it — a payout run converts a balance into it and
// needs a rate to do so.
//
// The base currency is let through unregistered, matching how models/ledger
// treats a recordable currency: the platform works before any currency is
// configured, and an install that could not register a USD payout account
// would be unusable for exactly as long as nobody had run the currency
// endpoints.
async function validatePayoutCurrency(code: string) {
  const normalizedCode = currency.normalizeCode(code);

  if (normalizedCode === pricing.BASE_CURRENCY) {
    return;
  }

  if (!(await pricing.isUsable(normalizedCode))) {
    throw new ValidationError({
      message: `The currency "${normalizedCode}" is not registered or is disabled.`,
      action: "Register and enable the currency before being paid in it.",
    });
  }
}

async function create(storeId: string, accountDto: PayoutAccountDto) {
  await validatePayoutCurrency(accountDto.payout_currency);

  try {
    return await prisma.payoutAccount.create({
      data: {
        store_id: storeId,
        provider: accountDto.provider,
        payout_currency: currency.normalizeCode(accountDto.payout_currency),
        label: accountDto.label,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: "This store already has a payout account.",
        action:
          "Update the existing payout account instead of creating a new one.",
      });
    }
    throw error;
  }
}

async function findOneByStoreId(storeId: string) {
  const account = await prisma.payoutAccount.findUnique({
    where: { store_id: storeId },
  });

  if (!account) {
    throw new NotFoundError({
      message: "This store has no payout account.",
      action: "Register a payout account before reading or updating it.",
    });
  }

  return account;
}

async function update(storeId: string, updateDto: PayoutAccountUpdateDto) {
  const existingAccount = await findOneByStoreId(storeId);

  if (updateDto.payout_currency) {
    await validatePayoutCurrency(updateDto.payout_currency);
  }

  const normalizedCurrency = updateDto.payout_currency
    ? currency.normalizeCode(updateDto.payout_currency)
    : undefined;

  // Changing the rail invalidates the verification that was done against it.
  // Whoever was verified was verified to receive money at a particular provider
  // in a particular currency; leaving the flag set would let an outlet be
  // checked for one destination and paid at another. A label edit is cosmetic
  // and resets nothing.
  const railChanged =
    (updateDto.provider && updateDto.provider !== existingAccount.provider) ||
    (normalizedCurrency &&
      normalizedCurrency !== existingAccount.payout_currency);

  return await prisma.payoutAccount.update({
    where: { store_id: storeId },
    data: {
      provider: updateDto.provider,
      payout_currency: normalizedCurrency,
      label: updateDto.label,
      ...(railChanged
        ? { provider_account_id: null, payouts_enabled: false }
        : {}),
    },
  });
}

// The verification side of the account, unreachable from anything an outlet can
// send. Written today by the admin backoffice endpoint; the provider status
// sync will call the same function once a provider adapter exists.
async function setProviderState(
  storeId: string,
  state: { payouts_enabled?: boolean; provider_account_id?: string | null },
) {
  await findOneByStoreId(storeId);

  return await prisma.payoutAccount.update({
    where: { store_id: storeId },
    data: {
      payouts_enabled: state.payouts_enabled,
      provider_account_id: state.provider_account_id,
    },
  });
}

const payoutAccount = {
  PAYOUT_PROVIDERS,
  create,
  findOneByStoreId,
  update,
  setProviderState,
};

export default payoutAccount;
