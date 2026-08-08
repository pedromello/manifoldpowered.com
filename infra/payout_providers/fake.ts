import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "infra/errors";
import type {
  CreateAccountInput,
  PayoutProviderAdapter,
  ProviderAccount,
  ProviderAccountStatus,
  ProviderPayout,
  SendPayoutInput,
} from "./index";

// A payout rail that keeps its state in a Map.
//
// This repo mocks nothing — the suite runs against a real postgres, a real
// SMTP catcher and a real S3 (infra/compose.yaml), and `jest.mock` appears
// nowhere in tests/. So the way to exercise a payout end to end is a real
// adapter with a fake backend, not a stubbed Stripe. It is also what proves the
// interface is swappable: two adapters satisfy it, and the call sites can tell
// them apart only by the key.
//
// Registered outside production only — see the comment in ./index.

interface FakeAccount {
  provider_account_id: string;
  store_id: string;
  payout_currency: string;
  payouts_enabled: boolean;
}

interface FakePayout {
  provider_payout_id: string;
  provider_account_id: string;
  amount: string;
  currency: string;
  idempotency_key: string;
  status: "PAID";
}

const accounts = new Map<string, FakeAccount>();
const payouts = new Map<string, FakePayout>();
// Keyed by idempotency key, so a retried payout returns the first one rather
// than paying twice. The real rails behave this way and a fake that did not
// would let task 10's re-runnability pass here and fail in production.
const payoutsByIdempotencyKey = new Map<string, string>();

const KEY = "FAKE";

// Two currencies, not one, so multi-currency routing has something to route:
// a rail declaring only USD (as the Stripe skeleton does) and a rail declaring
// both is the smallest arrangement in which "pick a rail that can pay this
// balance" is a real decision.
const SUPPORTED_CURRENCIES = ["USD", "BRL"] as const;

function assertSupportedCurrency(code: string) {
  const normalizedCode = code.trim().toUpperCase();

  if (!SUPPORTED_CURRENCIES.includes(normalizedCode as "USD" | "BRL")) {
    throw new ValidationError({
      message: `The fake payout provider cannot pay in "${normalizedCode}".`,
      action: `Use one of: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    });
  }

  return normalizedCode;
}

function findAccountOrThrow(providerAccountId: string): FakeAccount {
  const account = accounts.get(providerAccountId);

  if (!account) {
    throw new NotFoundError({
      message: `The fake payout provider has no account "${providerAccountId}".`,
      action: "Create the account before reading or paying it.",
    });
  }

  return account;
}

async function createAccount(
  input: CreateAccountInput,
): Promise<ProviderAccount> {
  const payoutCurrency = assertSupportedCurrency(input.payout_currency);
  const providerAccountId = `fake_acct_${randomUUID()}`;

  // Disabled on creation, like every real rail: registering a destination is
  // not the same as having been verified to receive money at it.
  accounts.set(providerAccountId, {
    provider_account_id: providerAccountId,
    store_id: input.store_id,
    payout_currency: payoutCurrency,
    payouts_enabled: false,
  });

  return { provider_account_id: providerAccountId, payouts_enabled: false };
}

async function getAccountStatus(
  providerAccountId: string,
): Promise<ProviderAccountStatus> {
  const account = findAccountOrThrow(providerAccountId);

  return {
    provider_account_id: account.provider_account_id,
    payouts_enabled: account.payouts_enabled,
  };
}

async function sendPayout(input: SendPayoutInput): Promise<ProviderPayout> {
  const account = findAccountOrThrow(input.provider_account_id);
  const currencyCode = assertSupportedCurrency(input.currency);

  const existingPayoutId = payoutsByIdempotencyKey.get(input.idempotency_key);
  if (existingPayoutId) {
    const existingPayout = payouts.get(existingPayoutId);
    if (existingPayout) {
      return {
        provider_payout_id: existingPayout.provider_payout_id,
        status: existingPayout.status,
      };
    }
  }

  if (!account.payouts_enabled) {
    throw new ValidationError({
      message: `The fake payout account "${input.provider_account_id}" is not verified.`,
      action: "Enable payouts on the account before sending one.",
    });
  }

  if (input.amount.lessThanOrEqualTo(0)) {
    throw new ValidationError({
      message: "A payout amount must be greater than zero.",
      action: "Send a positive amount.",
    });
  }

  const providerPayoutId = `fake_po_${randomUUID()}`;

  payouts.set(providerPayoutId, {
    provider_payout_id: providerPayoutId,
    provider_account_id: input.provider_account_id,
    // Stored at the ledger's scale, not via toString(): toString() normalises
    // trailing zeros, so a 199.9000 payout would be recorded as "199.9" in the
    // one place someone reconciles it against a bank line (see CLAUDE.md).
    amount: input.amount.toFixed(4),
    currency: currencyCode,
    idempotency_key: input.idempotency_key,
    status: "PAID",
  });
  payoutsByIdempotencyKey.set(input.idempotency_key, providerPayoutId);

  return { provider_payout_id: providerPayoutId, status: "PAID" };
}

async function getPayoutStatus(
  providerPayoutId: string,
): Promise<ProviderPayout> {
  const payout = payouts.get(providerPayoutId);

  if (!payout) {
    throw new NotFoundError({
      message: `The fake payout provider has no payout "${providerPayoutId}".`,
      action: "Send the payout before reading its status.",
    });
  }

  return {
    provider_payout_id: payout.provider_payout_id,
    status: payout.status,
  };
}

// Test seams. Verification on a real rail is an out-of-band event — a webhook,
// a review — so a fake needs a way to say it happened; without one, nothing
// downstream of `payouts_enabled` is reachable in a test.
export function markVerified(providerAccountId: string): void {
  const account = findAccountOrThrow(providerAccountId);
  account.payouts_enabled = true;
}

export function reset(): void {
  accounts.clear();
  payouts.clear();
  payoutsByIdempotencyKey.clear();
}

const fakeProvider: PayoutProviderAdapter & {
  markVerified: typeof markVerified;
  reset: typeof reset;
} = {
  key: KEY,
  supportedCurrencies: SUPPORTED_CURRENCIES,
  createAccount,
  getAccountStatus,
  sendPayout,
  getPayoutStatus,
  markVerified,
  reset,
};

export default fakeProvider;
