import orchestrator from "tests/orchestrator";

const BASE_URL = "http://localhost:3000/api/v1/stores";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function getPayoutAccount(slug: string, sessionToken?: string) {
  return await fetch(`${BASE_URL}/${slug}/payout-account`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

async function seedOutlet({ withAccount = true } = {}) {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  const session = await orchestrator.createSession(owner.id);

  const account = withAccount
    ? await orchestrator.createPayoutAccount(store.id, { label: "Main rail" })
    : null;

  return { owner, store, session, account };
}

describe("GET /api/v1/stores/[slug]/payout-account", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const { store } = await seedOutlet();

      const response = await getPayoutAccount(store.slug);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: read:payout_account",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  describe("Outlet owner", () => {
    test("should return the payout account", async () => {
      const { store, session, account } = await seedOutlet();

      const response = await getPayoutAccount(store.slug, session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: account.id,
        store_id: store.id,
        provider: "STRIPE",
        payout_currency: "USD",
        label: "Main rail",
        payouts_enabled: false,
        created_at: account.created_at.toISOString(),
        updated_at: account.updated_at.toISOString(),
      });
    });

    // The one field in this table that is not the outlet's to see. Asserted
    // against a row that definitely has one, so the test would catch the filter
    // being widened rather than merely passing on a null.
    test("should never expose the provider account id", async () => {
      const { store, session } = await seedOutlet();
      await orchestrator.enablePayouts(store.id, "acct_secret_123");

      const response = await getPayoutAccount(store.slug, session.token);
      const responseBody = await response.json();

      expect(responseBody.payouts_enabled).toBe(true);
      expect(responseBody).not.toHaveProperty("provider_account_id");
      expect(JSON.stringify(responseBody)).not.toContain("acct_secret_123");
    });

    test("should return 404 when the outlet has no payout account", async () => {
      const { store, session } = await seedOutlet({ withAccount: false });

      const response = await getPayoutAccount(store.slug, session.token);

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "This store has no payout account.",
        action: "Register a payout account before reading or updating it.",
        name: "NotFoundError",
        status_code: 404,
      });
    });

    test("should not be reachable by a disabled user", async () => {
      const { owner, store, session } = await seedOutlet();

      await orchestrator.disableUser(owner.id);

      const response = await getPayoutAccount(store.slug, session.token);

      expect(response.status).toBe(403);
    });
  });

  describe("Outlet member", () => {
    test("should read the account when granted the permission", async () => {
      const { store } = await seedOutlet();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "read:payout_account",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await getPayoutAccount(store.slug, memberSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.provider).toBe("STRIPE");
      expect(responseBody).not.toHaveProperty("provider_account_id");
    });

    test("should be refused without that permission", async () => {
      const { store } = await seedOutlet();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "update:store",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await getPayoutAccount(store.slug, memberSession.token);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message:
          "You do not have permission to view this store's payout account",
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

      const response = await getPayoutAccount(
        store.slug,
        strangerSession.token,
      );

      expect(response.status).toBe(403);
    });

    test("should return 404 for an outlet that does not exist", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await getPayoutAccount("no-such-outlet", session.token);

      expect(response.status).toBe(404);
    });
  });

  // Support needs to see which rail an outlet is on to answer "where did my
  // money go". It still does not get the external account id.
  describe("Admin", () => {
    test("should read any outlet's payout account", async () => {
      const { store } = await seedOutlet();
      await orchestrator.enablePayouts(store.id, "acct_secret_456");

      const admin = await orchestrator.createAdminUser();
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await getPayoutAccount(store.slug, adminSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.store_id).toBe(store.id);
      expect(responseBody).not.toHaveProperty("provider_account_id");
    });
  });
});
