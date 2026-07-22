import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/studios", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: create:studio",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test("Should return only the requesting user's own studios", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const ownedStudio = await orchestrator.createStudio(owner.id, {
        name: "My Owned Studio",
      });

      const otherUser = await orchestrator.createUser();
      await orchestrator.activateUser(otherUser.id);
      await orchestrator.createStudio(otherUser.id, {
        name: "Someone Elses Studio",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        headers: { Cookie: `session_id=${ownerSession.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.studios).toHaveLength(1);
      expect(responseBody.studios[0].id).toBe(ownedStudio.id);
      expect(responseBody.studios[0].name).toBe("My Owned Studio");
      expect(responseBody.pagination.total).toBe(1);
    });

    test("With zero studios should return an empty list", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.studios).toEqual([]);
      expect(responseBody.pagination.total).toBe(0);
    });
  });
});
