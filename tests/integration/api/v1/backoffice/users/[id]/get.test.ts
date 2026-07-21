import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function fetchBackofficeUser(id: string, sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/users/${id}`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

describe("GET /api/v1/backoffice/users/[id]", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const target = await orchestrator.createUser();
      const response = await fetchBackofficeUser(target.id);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Should return the full user record, including email", async () => {
      const target = await orchestrator.createUser({
        email: "detail-target@example.com",
      });
      await orchestrator.activateUser(target.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeUser(target.id, session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.id).toBe(target.id);
      expect(responseBody.email).toBe("detail-target@example.com");
    });

    test("With an unknown id should return 404 Not Found", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeUser(
        "00000000-0000-4000-8000-000000000000",
        session.token,
      );
      expect(response.status).toBe(404);
    });
  });
});
