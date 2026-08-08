import { Prisma } from "generated/prisma/client";
import fakeProvider from "infra/payout_providers/fake";

// No orchestrator: the fake rail holds its state in memory and touches no
// service, so this is a unit test by the rule in CLAUDE.md.
beforeEach(() => {
  fakeProvider.reset();
});

async function createVerifiedAccount() {
  const account = await fakeProvider.createAccount({
    store_id: "00000000-0000-0000-0000-000000000001",
    payout_currency: "USD",
  });

  fakeProvider.markVerified(account.provider_account_id);

  return account;
}

describe("infra/payout_providers/fake.ts", () => {
  describe(".createAccount()", () => {
    test("mints an account that is not yet payable", async () => {
      const account = await fakeProvider.createAccount({
        store_id: "00000000-0000-0000-0000-000000000001",
        payout_currency: "USD",
      });

      expect(account.provider_account_id).toEqual(expect.any(String));
      expect(account.payouts_enabled).toBe(false);
    });

    test("refuses a currency the rail does not declare", async () => {
      await expect(
        fakeProvider.createAccount({
          store_id: "00000000-0000-0000-0000-000000000001",
          payout_currency: "JPY",
        }),
      ).rejects.toThrow('The fake payout provider cannot pay in "JPY".');
    });
  });

  describe(".getAccountStatus()", () => {
    test("reports the account as payable only once verified", async () => {
      const account = await fakeProvider.createAccount({
        store_id: "00000000-0000-0000-0000-000000000001",
        payout_currency: "USD",
      });

      const before = await fakeProvider.getAccountStatus(
        account.provider_account_id,
      );
      expect(before.payouts_enabled).toBe(false);

      fakeProvider.markVerified(account.provider_account_id);

      const after = await fakeProvider.getAccountStatus(
        account.provider_account_id,
      );
      expect(after.provider_account_id).toBe(account.provider_account_id);
      expect(after.payouts_enabled).toBe(true);
    });

    test("refuses an account it never issued", async () => {
      await expect(
        fakeProvider.getAccountStatus("fake_acct_nope"),
      ).rejects.toThrow(
        'The fake payout provider has no account "fake_acct_nope".',
      );
    });
  });

  describe(".sendPayout()", () => {
    test("pays a verified account", async () => {
      const account = await createVerifiedAccount();

      const payout = await fakeProvider.sendPayout({
        provider_account_id: account.provider_account_id,
        amount: new Prisma.Decimal("199.9000"),
        currency: "USD",
        idempotency_key: "period-2026-08:store-1",
      });

      expect(payout.provider_payout_id).toEqual(expect.any(String));
      expect(payout.status).toBe("PAID");
    });

    test("refuses to pay an account that was never verified", async () => {
      const account = await fakeProvider.createAccount({
        store_id: "00000000-0000-0000-0000-000000000001",
        payout_currency: "USD",
      });

      await expect(
        fakeProvider.sendPayout({
          provider_account_id: account.provider_account_id,
          amount: new Prisma.Decimal("10.0000"),
          currency: "USD",
          idempotency_key: "period-2026-08:store-1",
        }),
      ).rejects.toThrow("is not verified");
    });

    test("refuses a non-positive amount", async () => {
      const account = await createVerifiedAccount();

      await expect(
        fakeProvider.sendPayout({
          provider_account_id: account.provider_account_id,
          amount: new Prisma.Decimal("0"),
          currency: "USD",
          idempotency_key: "period-2026-08:store-1",
        }),
      ).rejects.toThrow("A payout amount must be greater than zero.");
    });

    // The property task 10's re-runnable payout run depends on: sending the
    // same key twice is one payment, not two.
    test("returns the first payout when the same idempotency key is resent", async () => {
      const account = await createVerifiedAccount();

      const first = await fakeProvider.sendPayout({
        provider_account_id: account.provider_account_id,
        amount: new Prisma.Decimal("50.0000"),
        currency: "USD",
        idempotency_key: "period-2026-08:store-1",
      });

      const second = await fakeProvider.sendPayout({
        provider_account_id: account.provider_account_id,
        amount: new Prisma.Decimal("50.0000"),
        currency: "USD",
        idempotency_key: "period-2026-08:store-1",
      });

      expect(second.provider_payout_id).toBe(first.provider_payout_id);
    });
  });

  describe(".getPayoutStatus()", () => {
    test("reads back a payout it sent", async () => {
      const account = await createVerifiedAccount();

      const sent = await fakeProvider.sendPayout({
        provider_account_id: account.provider_account_id,
        amount: new Prisma.Decimal("25.5000"),
        currency: "USD",
        idempotency_key: "period-2026-08:store-1",
      });

      const status = await fakeProvider.getPayoutStatus(
        sent.provider_payout_id,
      );

      expect(status).toEqual({
        provider_payout_id: sent.provider_payout_id,
        status: "PAID",
      });
    });

    test("refuses a payout it never sent", async () => {
      await expect(
        fakeProvider.getPayoutStatus("fake_po_nope"),
      ).rejects.toThrow(
        'The fake payout provider has no payout "fake_po_nope".',
      );
    });
  });

  describe(".reset()", () => {
    test("forgets accounts, so one test cannot see another's", async () => {
      const account = await createVerifiedAccount();

      fakeProvider.reset();

      await expect(
        fakeProvider.getAccountStatus(account.provider_account_id),
      ).rejects.toThrow("has no account");
    });
  });
});
