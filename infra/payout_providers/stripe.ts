import { ServiceError } from "infra/errors";
import type {
  CreateAccountInput,
  PayoutProviderAdapter,
  ProviderAccount,
  ProviderAccountStatus,
  ProviderPayout,
  SendPayoutInput,
} from "./index";

// Stripe, declared but not yet wired.
//
// The rail is registered so the column value "STRIPE" resolves, so the
// interface has a second implementation holding it honest, and so the currency
// it can pay in is a fact the payout run can already route on. What it cannot
// do yet is move money, and it says so rather than pretending.
//
// This is deliberate rather than unfinished. The implementation is Connect
// accounts (createAccount / getAccountStatus) plus Transfers (sendPayout /
// getPayoutStatus), and none of it is verifiable here: the suite has no
// network mocking of any kind, so a real implementation would ship as code no
// test ever runs, against an account whose Connect configuration is not
// settled. A rail that throws is a smaller lie than a rail that is untested.
//
// When it lands: add `stripe` with `npm install -E`, and construct the client
// lazily inside each method. infra/storage.ts and infra/email.ts build their
// clients at module scope, which is fine for services the dev environment
// always runs — doing it here would make an unset STRIPE_SECRET_KEY break
// importing this module at all, including in every test that only wanted the
// fake.

const KEY = "STRIPE";

// A deliberately conservative subset of what Stripe Connect can pay out in.
// The real ceiling depends on the connected account's country and the
// platform's own configuration, which cannot be known before an account
// exists, so this lists the currencies the platform actually prices and sells
// in today. Understating is the safe direction: a rail that declines to route
// a balance leaves it unpaid and visible, where overstating routes money at a
// destination that rejects it after the ledger has already recorded the send.
//
// Widen this from the connected account's capabilities once createAccount is
// real, rather than by editing the list by hand.
const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "BRL"] as const;

function notConfigured(operation: string): never {
  throw new ServiceError({
    message: `Stripe payouts are not configured, so "${operation}" is unavailable.`,
    action:
      "Configure the Stripe payout provider, or use a different payout provider.",
    context: { provider: KEY, operation },
  });
}

async function createAccount(
  input: CreateAccountInput,
): Promise<ProviderAccount> {
  void input;
  notConfigured("createAccount");
}

async function getAccountStatus(
  providerAccountId: string,
): Promise<ProviderAccountStatus> {
  void providerAccountId;
  notConfigured("getAccountStatus");
}

async function sendPayout(input: SendPayoutInput): Promise<ProviderPayout> {
  void input;
  notConfigured("sendPayout");
}

async function getPayoutStatus(
  providerPayoutId: string,
): Promise<ProviderPayout> {
  void providerPayoutId;
  notConfigured("getPayoutStatus");
}

const stripeProvider: PayoutProviderAdapter = {
  key: KEY,
  supportedCurrencies: SUPPORTED_CURRENCIES,
  createAccount,
  getAccountStatus,
  sendPayout,
  getPayoutStatus,
};

export default stripeProvider;
