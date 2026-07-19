import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/studios/[slug]/members/[username]", () => {
  describe("Owner", () => {
    test("With valid permissions should update the member and return 200", async () => {
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
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members/${member.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            permissions: ["update:studio", "manage:studio_members"],
          }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.permissions).toEqual([
        "update:studio",
        "manage:studio_members",
      ]);
      expect(responseBody.username).toBe(member.username);
    });

    test("With non-member username should return 404", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const notAMember = await orchestrator.createUser();
      await orchestrator.activateUser(notAMember.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members/${notAMember.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ permissions: ["update:studio"] }),
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Unrelated activated user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStudioMember(createdStudio.id, member.username, [
        "update:studio",
      ]);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members/${member.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({ permissions: ["manage:studio_members"] }),
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
