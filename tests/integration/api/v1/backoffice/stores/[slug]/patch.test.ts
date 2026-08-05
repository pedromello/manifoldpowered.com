import orchestrator from "tests/orchestrator";

const BASE_URL = "http://localhost:3000/api/v1/backoffice/stores";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function createStoreWithOwner() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  return await orchestrator.createStore(owner.id);
}

async function patchAs(slug: string, sessionToken: string, body: unknown) {
  return await fetch(`${BASE_URL}/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/backoffice/stores/[slug]", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const store = await createStoreWithOwner();

      const response = await fetch(`${BASE_URL}/${store.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission_rate: 0.2 }),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: update:store_commission:any",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  // The rate is what keeps an outlet an affiliate rather than a negotiating
  // party, so its own owner must not be able to move it.
  describe("Outlet owner", () => {
    test("should return 403 Forbidden on their own outlet", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const store = await orchestrator.createStore(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await patchAs(store.slug, session.token, {
        commission_rate: 0.9,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("should set the commission rate and return 200", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const store = await createStoreWithOwner();

      const response = await patchAs(store.slug, session.token, {
        commission_rate: 0.2,
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.id).toBe(store.id);
      expect(responseBody.slug).toBe(store.slug);
      expect(responseBody.commission_rate).toBe("0.20000000");
    });

    // Null returns the outlet to the platform default, which is a different
    // intent from a rate of zero.
    test("should clear the rate when given null", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const store = await createStoreWithOwner();

      await patchAs(store.slug, session.token, { commission_rate: 0.2 });
      const response = await patchAs(store.slug, session.token, {
        commission_rate: null,
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.commission_rate).toBeNull();
    });

    test("should write an audit log entry with the previous rate", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const store = await createStoreWithOwner();

      await patchAs(store.slug, session.token, { commission_rate: 0.2 });
      await patchAs(store.slug, session.token, { commission_rate: 0.3 });

      const auditLog = (await import("models/audit_log")).default;
      const { logs } = await auditLog.findAllPaginated({
        action: "store:update_commission",
        target_id: store.id,
      });

      expect(logs).toHaveLength(2);
      expect(logs[0].metadata).toMatchObject({
        slug: store.slug,
        previous: { commission_rate: "0.20000000" },
        applied: { commission_rate: "0.30000000" },
      });
    });

    test("should return 400 for a rate above 1", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const store = await createStoreWithOwner();

      const response = await patchAs(store.slug, session.token, {
        commission_rate: 1.5,
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });

    test("should return 400 for a negative rate", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const store = await createStoreWithOwner();

      const response = await patchAs(store.slug, session.token, {
        commission_rate: -0.1,
      });

      expect(response.status).toBe(400);
    });

    test("should return 404 for an unknown outlet", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchAs("no-such-outlet", session.token, {
        commission_rate: 0.2,
      });

      expect(response.status).toBe(404);
    });

    // The rate must never appear on a surface a shopper can reach.
    test("should not expose the rate through the public store endpoint", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const store = await createStoreWithOwner();

      await patchAs(store.slug, session.token, { commission_rate: 0.2 });

      const publicResponse = await fetch(
        `http://localhost:3000/api/v1/stores/${store.slug}`,
      );
      const publicBody = await publicResponse.json();

      expect(publicResponse.status).toBe(200);
      expect(publicBody).not.toHaveProperty("commission_rate");
    });
  });
});
