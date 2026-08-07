import orchestrator from "tests/orchestrator";
import { prisma } from "infra/database";

const BASE_URL = "http://localhost:3000/api/v1/backoffice/stores";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function patchPayoutStatus(
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

async function seedOutlet({ withAccount = true } = {}) {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const store = await orchestrator.createStore(owner.id);
  const ownerSession = await orchestrator.createSession(owner.id);

  if (withAccount) {
    await orchestrator.createPayoutAccount(store.id);
  }

  return { owner, store, ownerSession };
}

async function createAdminSession() {
  const admin = await orchestrator.createAdminUser();
  const session = await orchestrator.createSession(admin.id);

  return { admin, session };
}

describe("PATCH /api/v1/backoffice/stores/[slug]/payout-account", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const { store } = await seedOutlet();

      const response = await patchPayoutStatus(store.slug, {
        payouts_enabled: true,
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: update:payout_account:status:any",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  // The point of the split: an outlet says where its money goes and cannot say
  // that it may go there.
  describe("Outlet owner", () => {
    test("should be refused enabling their own payouts", async () => {
      const { store, ownerSession } = await seedOutlet();

      const response = await patchPayoutStatus(
        store.slug,
        { payouts_enabled: true },
        ownerSession.token,
      );

      expect(response.status).toBe(403);

      const account = await prisma.payoutAccount.findUnique({
        where: { store_id: store.id },
      });
      expect(account.payouts_enabled).toBe(false);
    });
  });

  describe("Admin", () => {
    test("should enable payouts", async () => {
      const { store } = await seedOutlet();
      const { session } = await createAdminSession();

      const response = await patchPayoutStatus(
        store.slug,
        { payouts_enabled: true, reason: "Identity verification complete" },
        session.token,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.store_id).toBe(store.id);
      expect(responseBody.payouts_enabled).toBe(true);
      expect(responseBody).not.toHaveProperty("provider_account_id");
    });

    test("should disable payouts again", async () => {
      const { store } = await seedOutlet();
      const { session } = await createAdminSession();

      await patchPayoutStatus(
        store.slug,
        { payouts_enabled: true },
        session.token,
      );
      const response = await patchPayoutStatus(
        store.slug,
        { payouts_enabled: false },
        session.token,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.payouts_enabled).toBe(false);
    });

    // "Why is this outlet payable" is a question asked long after the fact.
    test("should record an audit log entry", async () => {
      const { store } = await seedOutlet();
      const { admin, session } = await createAdminSession();

      await patchPayoutStatus(
        store.slug,
        { payouts_enabled: true, reason: "Identity verification complete" },
        session.token,
      );

      const log = await prisma.adminActionLog.findFirstOrThrow({
        where: { action: "payout_account:status" },
      });

      expect(log.admin_user_id).toBe(admin.id);
      expect(log.target_type).toBe("payout_account");
      expect(log.reason).toBe("Identity verification complete");
      expect(log.metadata).toMatchObject({
        store_id: store.id,
        store_slug: store.slug,
        previous: { payouts_enabled: false },
        applied: { payouts_enabled: true },
      });
    });

    test("should refuse a non-boolean payouts_enabled", async () => {
      const { store } = await seedOutlet();
      const { session } = await createAdminSession();

      const response = await patchPayoutStatus(
        store.slug,
        { payouts_enabled: "yes" },
        session.token,
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid request payload");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });

    test("should return 404 when the outlet has no payout account", async () => {
      const { store } = await seedOutlet({ withAccount: false });
      const { session } = await createAdminSession();

      const response = await patchPayoutStatus(
        store.slug,
        { payouts_enabled: true },
        session.token,
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "This store has no payout account.",
        action: "Register a payout account before reading or updating it.",
        name: "NotFoundError",
        status_code: 404,
      });
    });

    test("should return 404 for an outlet that does not exist", async () => {
      const { session } = await createAdminSession();

      const response = await patchPayoutStatus(
        "no-such-outlet",
        { payouts_enabled: true },
        session.token,
      );

      expect(response.status).toBe(404);
    });
  });
});
