import orchestrator from "tests/orchestrator";

const BASE_URL = "http://localhost:3000/api/v1/stores";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function postPayoutAccount(
  slug: string,
  body: unknown,
  sessionToken?: string,
) {
  return await fetch(`${BASE_URL}/${slug}/payout-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function seedOutlet() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  const session = await orchestrator.createSession(owner.id);

  return { owner, store, session };
}

const VALID_BODY = { provider: "STRIPE", payout_currency: "USD" };

describe("POST /api/v1/stores/[slug]/payout-account", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const { store } = await seedOutlet();

      const response = await postPayoutAccount(store.slug, VALID_BODY);

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
    test("should register a payout account", async () => {
      const { store, session } = await seedOutlet();

      const response = await postPayoutAccount(
        store.slug,
        { ...VALID_BODY, label: "Nubank business" },
        session.token,
      );

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody.store_id).toBe(store.id);
      expect(responseBody.provider).toBe("STRIPE");
      expect(responseBody.payout_currency).toBe("USD");
      expect(responseBody.label).toBe("Nubank business");
      expect(responseBody).not.toHaveProperty("provider_account_id");
    });

    // The whole gate. A newly registered account is not payable, and the party
    // being paid is not the one who decides otherwise.
    test("should create the account with payouts disabled", async () => {
      const { store, session } = await seedOutlet();

      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
        session.token,
      );
      const responseBody = await response.json();

      expect(responseBody.payouts_enabled).toBe(false);
    });

    test("should ignore payouts_enabled and provider_account_id in the body", async () => {
      const { store, session } = await seedOutlet();

      const response = await postPayoutAccount(
        store.slug,
        {
          ...VALID_BODY,
          payouts_enabled: true,
          provider_account_id: "acct_forged",
        },
        session.token,
      );

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody.payouts_enabled).toBe(false);
      expect(JSON.stringify(responseBody)).not.toContain("acct_forged");
    });

    test("should refuse a second account for the same outlet", async () => {
      const { store, session } = await seedOutlet();

      await postPayoutAccount(store.slug, VALID_BODY, session.token);
      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
        session.token,
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "This store already has a payout account.",
        action:
          "Update the existing payout account instead of creating a new one.",
        name: "ValidationError",
        status_code: 400,
      });
    });

    test("should refuse an unknown provider", async () => {
      const { store, session } = await seedOutlet();

      const response = await postPayoutAccount(
        store.slug,
        { provider: "PAYPAL", payout_currency: "USD" },
        session.token,
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });

    test("should refuse a currency that is not registered", async () => {
      const { store, session } = await seedOutlet();

      const response = await postPayoutAccount(
        store.slug,
        { provider: "STRIPE", payout_currency: "BRL" },
        session.token,
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: 'The currency "BRL" is not registered or is disabled.',
        action: "Register and enable the currency before being paid in it.",
        name: "ValidationError",
        status_code: 400,
      });
    });

    test("should refuse a currency that is registered but disabled", async () => {
      const { store, session } = await seedOutlet();
      await orchestrator.createCurrency({
        code: "BRL",
        symbol: "R$",
        enabled: false,
      });

      const response = await postPayoutAccount(
        store.slug,
        { provider: "STRIPE", payout_currency: "BRL" },
        session.token,
      );

      expect(response.status).toBe(400);
    });

    test("should accept a registered and enabled currency", async () => {
      const { store, session } = await seedOutlet();
      await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

      const response = await postPayoutAccount(
        store.slug,
        { provider: "STRIPE", payout_currency: "brl" },
        session.token,
      );

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody.payout_currency).toBe("BRL");
    });

    test("should not be reachable by a disabled user", async () => {
      const { owner, store, session } = await seedOutlet();

      await orchestrator.disableUser(owner.id);

      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
        session.token,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Outlet member", () => {
    test("should register the account when granted the permission", async () => {
      const { store } = await seedOutlet();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "manage:payout_account",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
        memberSession.token,
      );

      expect(response.status).toBe(201);
    });

    test("should be refused with only read access", async () => {
      const { store } = await seedOutlet();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(store.id, member.username, [
        "read:payout_account",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
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

      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
        strangerSession.token,
      );

      expect(response.status).toBe(403);
    });

    test("should return 404 for an outlet that does not exist", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await postPayoutAccount(
        "no-such-outlet",
        VALID_BODY,
        session.token,
      );

      expect(response.status).toBe(404);
    });
  });

  // There is deliberately no manage:payout_account:any. An admin can decide an
  // outlet is verified; an admin cannot decide where its money goes.
  describe("Admin", () => {
    test("should be refused registering an account for another outlet", async () => {
      const { store } = await seedOutlet();

      const admin = await orchestrator.createAdminUser();
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await postPayoutAccount(
        store.slug,
        VALID_BODY,
        adminSession.token,
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
});
