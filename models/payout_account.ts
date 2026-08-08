import { prisma } from "infra/database";
import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import currency, { currencyCodeSchema } from "models/currency";
import pricing from "models/pricing";
import payoutProviders from "infra/payout_providers";

// The rails we can pay an outlet through.
//
// No longer a list of its own: the registry in infra/payout_providers is the
// one place a rail is declared, and a second list here could disagree with it —
// a provider string that validates but resolves to no adapter, or an adapter
// nothing can select. Kept as an export because it reads as the answer to
// "which rails exist" at the model layer, where the rest of this schema's
// referential integrity lives.
export const PAYOUT_PROVIDERS = payoutProviders.providerKeys();

export type PayoutProvider = string;

// What an outlet may say about its own payout account.
//
// payouts_enabled and provider_account_id are absent by design, not by
// omission: the party being paid must not be able to declare itself payable,
// and the external account id is the provider's to issue. Both are written
// only through setProviderState below.
//
// provider is a refined string rather than z.enum because the allowed values
// come from the registry at runtime, and z.enum needs a literal tuple. The
// refinement normalizes first, so casing can never produce a row that matches
// no adapter.
export const payoutAccountSchema = z.object({
  provider: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => payoutProviders.isRegistered(value), {
      message: `provider must be one of: ${payoutProviders.providerKeys().join(", ")}`,
    }),
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

// A rail and a currency are only valid as a pair. Registering a BRL account on
// a USD-only provider is a row that looks complete, passes verification, and
// fails at the one moment it matters — when a payout run tries to send it. The
// provider declares what it can pay in, so the mismatch is knowable at write
// time; refusing here is the difference between a 400 to whoever chose the
// combination and a failed transfer nobody is watching.
function validateProviderPaysCurrency(providerKey: string, code: string) {
  const provider = payoutProviders.getProvider(providerKey);
  const normalizedCode = currency.normalizeCode(code);

  if (!payoutProviders.supportsCurrency(provider, normalizedCode)) {
    throw new ValidationError({
      message: `The payout provider "${provider.key}" cannot pay in "${normalizedCode}".`,
      action: `Choose a currency the provider supports (${provider.supportedCurrencies.join(", ")}), or a provider that pays in "${normalizedCode}".`,
    });
  }
}

async function create(storeId: string, accountDto: PayoutAccountDto) {
  await validatePayoutCurrency(accountDto.payout_currency);
  validateProviderPaysCurrency(accountDto.provider, accountDto.payout_currency);

  try {
    return await prisma.payoutAccount.create({
      data: {
        store_id: storeId,
        // Normalized on write as well as in the schema, for the same reason
        // payout_currency is: a model called directly — by a script, a batch
        // job, a test — bypasses the Zod layer, and a lowercase rail here would
        // resolve to no adapter while looking perfectly correct in the row.
        provider: payoutProviders.normalizeKey(accountDto.provider),
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

  // Normalized before it is compared, not just before it is stored: railChanged
  // below is a value comparison, so an unnormalized "stripe" against a stored
  // "STRIPE" would read as a rail change and silently reset a verified outlet
  // to unpayable.
  const normalizedProvider = updateDto.provider
    ? payoutProviders.normalizeKey(updateDto.provider)
    : undefined;

  // Checked against the pair the row will hold after the write, not against
  // the field that happened to be sent. Changing only the provider on a BRL
  // account is exactly the case a per-field check misses, and it is the one
  // that leaves an outlet unpayable on a rail that cannot reach its currency.
  validateProviderPaysCurrency(
    normalizedProvider ?? existingAccount.provider,
    normalizedCurrency ?? existingAccount.payout_currency,
  );

  // Changing the rail invalidates the verification that was done against it.
  // Whoever was verified was verified to receive money at a particular provider
  // in a particular currency; leaving the flag set would let an outlet be
  // checked for one destination and paid at another. A label edit is cosmetic
  // and resets nothing.
  const railChanged =
    (normalizedProvider && normalizedProvider !== existingAccount.provider) ||
    (normalizedCurrency &&
      normalizedCurrency !== existingAccount.payout_currency);

  return await prisma.payoutAccount.update({
    where: { store_id: storeId },
    data: {
      provider: normalizedProvider,
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
