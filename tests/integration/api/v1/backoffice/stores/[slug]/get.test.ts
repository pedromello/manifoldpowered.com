import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function fetchBackofficeStore(slug: string, sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/stores/${slug}`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

describe("GET /api/v1/backoffice/stores/[slug]", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      const createdStore = await orchestrator.createStore(owner.id);

      const response = await fetchBackofficeStore(createdStore.slug);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Should return the store", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id, {
        name: "Store Detail Target",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeStore(
        createdStore.slug,
        session.token,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBe(createdStore.id);
      expect(body.name).toBe("Store Detail Target");
    });

    test("With an unknown slug should return 404 Not Found", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeStore(
        "does-not-exist",
        session.token,
      );
      expect(response.status).toBe(404);
    });
  });
});
