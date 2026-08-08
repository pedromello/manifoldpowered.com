import { Prisma } from "generated/prisma/client";
import stripeProvider from "infra/payout_providers/stripe";

// The Stripe rail is registered but not wired. These tests pin the two things
// that must stay true while it is not: it is selectable and declares what it
// would pay in, and it never silently succeeds.
describe("infra/payout_providers/stripe.ts", () => {
  test("is a selectable rail that declares its currencies", () => {
    expect(stripeProvider.key).toBe("STRIPE");
    expect(stripeProvider.supportedCurrencies).toContain("USD");
  });

  test("every method refuses rather than pretending to move money", async () => {
    await expect(
      stripeProvider.createAccount({
        store_id: "00000000-0000-0000-0000-000000000001",
        payout_currency: "USD",
      }),
    ).rejects.toThrow("Stripe payouts are not configured");

    await expect(stripeProvider.getAccountStatus("acct_1")).rejects.toThrow(
      "Stripe payouts are not configured",
    );

    await expect(
      stripeProvider.sendPayout({
        provider_account_id: "acct_1",
        amount: new Prisma.Decimal("10.0000"),
        currency: "USD",
        idempotency_key: "period-2026-08:store-1",
      }),
    ).rejects.toThrow("Stripe payouts are not configured");

    await expect(stripeProvider.getPayoutStatus("po_1")).rejects.toThrow(
      "Stripe payouts are not configured",
    );
  });
});
