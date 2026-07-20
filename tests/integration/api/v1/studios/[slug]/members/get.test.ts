import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/studios/[slug]/members", () => {
  describe("Owner", () => {
    test("Should list the studio's members and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStudioMember(createdStudio.id, member.username, [
        "update:studio",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toHaveLength(1);
      expect(responseBody[0]).toEqual({
        id: responseBody[0].id,
        studio_id: createdStudio.id,
        user_id: member.id,
        username: member.username,
        permissions: ["update:studio"],
        created_at: responseBody[0].created_at,
        updated_at: responseBody[0].updated_at,
      });
    });
  });

  describe("Unrelated activated user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          headers: { Cookie: `session_id=${outsiderSession.token}` },
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
