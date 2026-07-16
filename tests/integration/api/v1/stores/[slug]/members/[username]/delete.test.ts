import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/stores/[slug]/members/[username]", () => {
  describe("Owner", () => {
    test("Should remove the member and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(createdStore.id, member.username, [
        "update:store",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members/${member.username}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ message: "Member removed from store" });

      const memberInDatabase = await prisma.storeMember.findUnique({
        where: {
          store_id_user_id: {
            store_id: createdStore.id,
            user_id: member.id,
          },
        },
      });
      expect(memberInDatabase).toBeNull();
    });

    test("With non-member username should return 404", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const notAMember = await orchestrator.createUser();
      await orchestrator.activateUser(notAMember.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members/${notAMember.username}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Removed member", () => {
    test("Should no longer be able to update the store", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStoreMember(createdStore.id, member.username, [
        "update:store",
      ]);

      await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members/${member.username}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${memberSession.token}`,
          },
          body: JSON.stringify({ description: "Should not work anymore" }),
        },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Unrelated activated user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(createdStore.id, member.username, [
        "update:store",
      ]);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members/${member.username}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${outsiderSession.token}` },
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
