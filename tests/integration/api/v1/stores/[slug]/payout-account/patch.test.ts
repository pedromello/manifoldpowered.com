import orchestrator from "tests/orchestrator";

const BASE_URL = "http://localhost:3000/api/v1/stores";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function patchPayoutAccount(
  slug: string,
  body: unknown,
  sessionToken?: string,
) {
  return await fetch(`${BASE_URL}/${slug}/payout-account`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function seedOutlet({ withAccount = true, verified = false } = {}) {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  const session = await orchestrator.createSession(owner.id);

  if (withAccount) {
    await orchestrator.createPayoutAccount(store.id, { label: "Main rail" });
  }

  if (verified) {
    await orchestrator.enablePayouts(store.id, "acct_verified_123");
  }

  return { owner, store, session };
}

describe("PATCH /api/v1/stores/[slug]/payout-account", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const { store } = await seedOutlet();

      const response = await patchPayoutAccount(store.slug, {
        label: "Renamed",
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: manage:payout_account",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  describe("Outlet owner", () => {
    test("should update the label", async () => {
      const { store, session } = await seedOutlet();

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        session.token,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.label).toBe("Renamed rail");
      expect(responseBody.payout_currency).toBe("USD");
    });

    test("should clear the label when sent null", async () => {
      const { store, session } = await seedOutlet();

      const response = await patchPayoutAccount(
        store.slug,
        { label: null },
        session.token,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.label).toBeNull();
    });

    // The rule the whole endpoint turns on. Verification was done against a
    // particular destination; move the destination and it no longer describes
    // anything, or an outlet gets checked for one rail and paid on another.
    test("should reset verification when the payout currency changes", async () => {
      const { store, session } = await seedOutlet({ verified: true });
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const response = await patchPayoutAccount(
        store.slug,
        { payout_currency: "BRL" },
        session.token,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.payout_currency).toBe("BRL");
      expect(responseBody.payouts_enabled).toBe(false);
    });

    // Cosmetic edits are not rail changes. Without this the reset would fire on
    // every write and an outlet could never be paid.
    test("should keep verification when only the label changes", async () => {
      const { store, session } = await seedOutlet({ verified: true });

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        session.token,
      );

      const responseBody = await response.json();
      expect(responseBody.payouts_enabled).toBe(true);
    });

    // The comparison is by value, not by the key being present.
    test("should keep verification when the rail is resent unchanged", async () => {
      const { store, session } = await seedOutlet({ verified: true });

      const response = await patchPayoutAccount(
        store.slug,
        { provider: "STRIPE", payout_currency: "usd" },
        session.token,
      );

      const responseBody = await response.json();
      expect(responseBody.payouts_enabled).toBe(true);
    });

    test("should refuse an empty body", async () => {
      const { store, session } = await seedOutlet();

      const response = await patchPayoutAccount(store.slug, {}, session.token);

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });

    test("should refuse a currency that is not registered", async () => {
      const { store, session } = await seedOutlet();

      const response = await patchPayoutAccount(
        store.slug,
        { payout_currency: "BRL" },
        session.token,
      );

      expect(response.status).toBe(400);
    });

    test("should never expose the provider account id", async () => {
      const { store, session } = await seedOutlet({ verified: true });

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        session.token,
      );
      const responseBody = await response.json();

      expect(responseBody).not.toHaveProperty("provider_account_id");
      expect(JSON.stringify(responseBody)).not.toContain("acct_verified_123");
    });

    test("should return 404 when the outlet has no payout account", async () => {
      const { store, session } = await seedOutlet({ withAccount: false });

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        session.token,
      );

      expect(response.status).toBe(404);
    });

    test("should not be reachable by a disabled user", async () => {
      const { owner, store, session } = await seedOutlet();

      await orchestrator.disableUser(owner.id);

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        session.token,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Outlet member", () => {
    test("should update the account when granted the permission", async () => {
      const { store } = await seedOutlet();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "manage:payout_account",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        memberSession.token,
      );

      expect(response.status).toBe(200);
    });

    test("should be refused with only read access", async () => {
      const { store } = await seedOutlet();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "read:payout_account",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        memberSession.token,
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message:
          "You do not have permission to manage this store's payout account",
        action: "Verify if you are an administrator of this store",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  describe("Unrelated user", () => {
    test("should be refused another outlet's payout account", async () => {
      const { store } = await seedOutlet();

      const stranger = await orchestrator.createUser();
      await orchestrator.activateUser(stranger.id);
      const strangerSession = await orchestrator.createSession(stranger.id);

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        strangerSession.token,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Admin", () => {
    test("should be refused redirecting another outlet's payout account", async () => {
      const { store } = await seedOutlet();

      const admin = await orchestrator.createAdminUser();
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await patchPayoutAccount(
        store.slug,
        { label: "Renamed rail" },
        adminSession.token,
      );

      expect(response.status).toBe(403);
    });
  });
});
