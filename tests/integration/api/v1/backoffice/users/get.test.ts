import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function fetchBackofficeUsers(query = "", sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/users${query}`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

describe("GET /api/v1/backoffice/users", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetchBackofficeUsers();
      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: read:user:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const nonAdmin = await orchestrator.createUser();
      await orchestrator.activateUser(nonAdmin.id);
      const session = await orchestrator.createSession(nonAdmin.id);

      const response = await fetchBackofficeUsers("", session.token);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Should return users including email, unlike the public read:user output", async () => {
      const target = await orchestrator.createUser({
        username: "backofficetarget",
        email: "backofficetarget@example.com",
      });
      await orchestrator.activateUser(target.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeUsers(
        "?q=backofficetarget",
        session.token,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.users).toHaveLength(1);
      expect(body.users[0].id).toBe(target.id);
      expect(body.users[0].email).toBe("backofficetarget@example.com");
    });

    test("Should search by username or email", async () => {
      await orchestrator.clearDatabaseRows();
      await orchestrator.createUser({
        username: "searchablealice",
        email: "alice@example.com",
      });
      await orchestrator.createUser({
        username: "bobnomatch",
        email: "match-by-email@example.com",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const byUsername = await fetchBackofficeUsers(
        "?q=searchablealice",
        session.token,
      );
      const byUsernameBody = await byUsername.json();
      expect(byUsernameBody.users).toHaveLength(1);
      expect(byUsernameBody.users[0].username).toBe("searchablealice");

      const byEmail = await fetchBackofficeUsers(
        "?q=match-by-email",
        session.token,
      );
      const byEmailBody = await byEmail.json();
      expect(byEmailBody.users).toHaveLength(1);
      expect(byEmailBody.users[0].username).toBe("bobnomatch");
    });
  });
});
