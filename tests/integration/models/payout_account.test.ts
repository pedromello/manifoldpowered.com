import orchestrator from "tests/orchestrator";
import payoutAccount from "models/payout_account";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function seedVerifiedAccount() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);

  await orchestrator.createPayoutAccount(store.id, { label: "Main rail" });
  await orchestrator.enablePayouts(store.id, "acct_verified_123");

  return { owner, store };
}

describe("payoutAccount.update", () => {
  // Verification is done against a destination, not against an outlet. Move the
  // destination and the old check describes nothing — the failure it prevents is
  // an outlet verified for one rail and paid on another.
  test("should reset verification when the payout currency changes", async () => {
    const { store } = await seedVerifiedAccount();
    await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

    const updated = await payoutAccount.update(store.id, {
      payout_currency: "BRL",
    });

    expect(updated.payout_currency).toBe("BRL");
    expect(updated.payouts_enabled).toBe(false);
    expect(updated.provider_account_id).toBeNull();
  });

  test("should keep verification when only the label changes", async () => {
    const { store } = await seedVerifiedAccount();

    const updated = await payoutAccount.update(store.id, {
      label: "Renamed rail",
    });

    expect(updated.label).toBe("Renamed rail");
    expect(updated.payouts_enabled).toBe(true);
    expect(updated.provider_account_id).toBe("acct_verified_123");
  });

  // Resending the same rail is not a change. Comparing on the key being present
  // rather than on the value would make the reset fire on every write, and an
  // outlet could never stay payable long enough to be paid.
  test("should keep verification when the rail is resent unchanged", async () => {
    const { store } = await seedVerifiedAccount();

    const updated = await payoutAccount.update(store.id, {
      provider: "STRIPE",
      payout_currency: "usd",
    });

    expect(updated.payouts_enabled).toBe(true);
    expect(updated.provider_account_id).toBe("acct_verified_123");
  });

  test("should throw NotFoundError when the outlet has no account", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id);

    await expect(
      payoutAccount.update(store.id, { label: "Renamed rail" }),
    ).rejects.toThrow("This store has no payout account.");
  });
});

describe("payoutAccount.setProviderState", () => {
  test("should flip the gate without touching the rail", async () => {
    const { store } = await seedVerifiedAccount();

    const disabled = await payoutAccount.setProviderState(store.id, {
      payouts_enabled: false,
    });

    expect(disabled.payouts_enabled).toBe(false);
    expect(disabled.provider).toBe("STRIPE");
    expect(disabled.payout_currency).toBe("USD");
    // Left alone: the account still exists at the provider, it is just not
    // cleared to be paid.
    expect(disabled.provider_account_id).toBe("acct_verified_123");
  });

  test("should throw NotFoundError when the outlet has no account", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id);

    await expect(
      payoutAccount.setProviderState(store.id, { payouts_enabled: true }),
    ).rejects.toThrow("This store has no payout account.");
  });
});

describe("payoutAccount.create", () => {
  // The base currency works before any currency is registered, matching how the
  // ledger treats a recordable currency: a fresh install must not be unable to
  // register a USD payout account.
  test("should accept the base currency while it is unregistered", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id);

    const created = await payoutAccount.create(store.id, {
      provider: "STRIPE",
      payout_currency: "USD",
    });

    expect(created.payout_currency).toBe("USD");
    expect(created.payouts_enabled).toBe(false);
    expect(created.provider_account_id).toBeNull();
  });
});
