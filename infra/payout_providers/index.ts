import { Prisma } from "generated/prisma/client";
import { ValidationError } from "infra/errors";
import fakeProvider from "./fake";
import stripeProvider from "./stripe";

// The payout rail, behind one interface, so the payout run never learns which
// one it is talking to.
//
// The alternative — a `if (provider === "STRIPE")` at each call site — puts the
// knowledge of every rail in every caller, and makes the second rail a change
// to code that already moves money. Four methods is the whole surface a payout
// needs: register a destination, ask whether it may be paid, pay it, ask what
// happened.

// How far a payout can get. A tuple plus a derived union rather than a Prisma
// enum, matching LEDGER_SOURCE_TYPES: no column holds this yet — the Payout
// table arrives in task 10 — and a provider that reports a state we have no
// name for should fail loudly at its own adapter rather than at a migration.
export const PAYOUT_STATUSES = ["PENDING", "PAID", "FAILED"] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export interface CreateAccountInput {
  // The outlet being paid. Passed rather than looked up because infra/ does not
  // read the database — the model layer owns that, and an adapter that queried
  // for a store would be untestable without one.
  store_id: string;
  payout_currency: string;
  email?: string;
  label?: string;
}

export interface ProviderAccount {
  provider_account_id: string;
  payouts_enabled: boolean;
}

// Deliberately the exact shape payoutAccount.setProviderState takes, so a
// status sync is a pass-through rather than a translation. A translation is
// where a rail's "restricted" quietly becomes our "enabled".
export interface ProviderAccountStatus {
  provider_account_id: string;
  payouts_enabled: boolean;
}

export interface SendPayoutInput {
  provider_account_id: string;
  // A Decimal, never a number: this is money, and the ledger holds four
  // decimal places (see CLAUDE.md). An adapter converts to whatever unit its
  // API wants at the boundary, and that conversion is the adapter's problem.
  amount: Prisma.Decimal;
  currency: string;
  // Ours, not the provider's. The payout run passes the same key when it
  // retries, which is what makes a re-run safe against a provider that already
  // accepted the first attempt.
  idempotency_key: string;
}

export interface ProviderPayout {
  provider_payout_id: string;
  status: PayoutStatus;
}

export interface PayoutProviderAdapter {
  // Matches PayoutAccount.provider. The column stores this string, which is
  // why it is on the adapter rather than only in the registry's keys: an
  // adapter that disagreed with its own key would route to itself under a name
  // nothing else uses.
  readonly key: string;

  // Which currencies this rail can actually pay in, normalized and uppercase.
  // Declared so a payout run can route a BRL balance to a rail that reaches
  // Pix and a USD balance to Stripe, instead of discovering the mismatch when
  // the transfer is rejected.
  readonly supportedCurrencies: readonly string[];

  createAccount(input: CreateAccountInput): Promise<ProviderAccount>;
  getAccountStatus(providerAccountId: string): Promise<ProviderAccountStatus>;
  sendPayout(input: SendPayoutInput): Promise<ProviderPayout>;
  getPayoutStatus(providerPayoutId: string): Promise<ProviderPayout>;
}

// Which rails exist. The fake is registered outside production for the same
// reason storage.clearAllBuckets refuses to run there: it is a test seam, and a
// test seam that can be selected in production is a way to mark an outlet
// payable without a provider ever seeing it.
//
// Registration happens here rather than in each adapter so that the set of
// rails is readable in one place, and so an adapter never has an import that
// runs for its own side effect.
const adapters: PayoutProviderAdapter[] = [
  stripeProvider,
  ...(process.env.NODE_ENV === "production" ? [] : [fakeProvider]),
];

const registry = new Map<string, PayoutProviderAdapter>(
  adapters.map((adapter) => [adapter.key, adapter]),
);

export function providerKeys(): string[] {
  return [...registry.keys()];
}

export function isRegistered(key: string): boolean {
  return registry.has(normalizeKey(key));
}

// A ValidationError rather than an InternalServerError because the key reaching
// here is caller-supplied: it comes off the payout-account endpoints, where an
// outlet names its own rail. An unknown rail is a bad request, not a bug.
export function getProvider(key: string): PayoutProviderAdapter {
  const adapter = registry.get(normalizeKey(key));

  if (!adapter) {
    throw new ValidationError({
      message: `"${key}" is not a supported payout provider.`,
      action: `Use one of: ${providerKeys().join(", ")}.`,
    });
  }

  return adapter;
}

// Keys are compared uppercase for the same reason currency codes are: the
// column is free text with no foreign key, so a casing difference would not
// fail — it would simply match nothing, and an outlet would sit unpayable with
// a row that looks correct.
export function normalizeKey(key: string): string {
  return key.trim().toUpperCase();
}

export function supportsCurrency(
  adapter: PayoutProviderAdapter,
  code: string,
): boolean {
  return adapter.supportedCurrencies.includes(code.trim().toUpperCase());
}

const payoutProviders = {
  PAYOUT_STATUSES,
  providerKeys,
  isRegistered,
  getProvider,
  normalizeKey,
  supportsCurrency,
};

export default payoutProviders;
