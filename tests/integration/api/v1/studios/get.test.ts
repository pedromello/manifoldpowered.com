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
    test("Returns studios the user owns and studios they are a member of, but not others'", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const ownedStudio = await orchestrator.createStudio(user.id, {
        name: "Owned Studio",
      });

      // A studio owned by someone else, that our user is a MEMBER of.
      const otherOwner = await orchestrator.createUser();
      await orchestrator.activateUser(otherOwner.id);
      const memberStudio = await orchestrator.createStudio(otherOwner.id, {
        name: "Member Studio",
      });
      await orchestrator.addStudioMember(memberStudio.id, user.username, [
        "update:studio",
      ]);

      // A studio our user neither owns nor belongs to.
      const unrelatedStudio = await orchestrator.createStudio(otherOwner.id, {
        name: "Unrelated Studio",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const ids = responseBody.studios.map((item: { id: string }) => item.id);
      expect(ids).toContain(ownedStudio.id);
      expect(ids).toContain(memberStudio.id);
      expect(ids).not.toContain(unrelatedStudio.id);
      expect(responseBody.studios).toHaveLength(2);
      expect(responseBody.pagination.total).toBe(2);
    });

    test("Lists owned studios before member-of studios", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      // Owned name sorts AFTER the member name alphabetically, so if owned
      // still comes first the owned-first ordering is proven.
      const ownedStudio = await orchestrator.createStudio(user.id, {
        name: "Zeta Owned Studio",
      });

      const otherOwner = await orchestrator.createUser();
      await orchestrator.activateUser(otherOwner.id);
      const memberStudio = await orchestrator.createStudio(otherOwner.id, {
        name: "Alpha Member Studio",
      });
      await orchestrator.addStudioMember(memberStudio.id, user.username, [
        "update:studio",
      ]);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        headers: { Cookie: `session_id=${session.token}` },
      });

      const responseBody = await response.json();
      const ids = responseBody.studios.map((item: { id: string }) => item.id);
      expect(ids.indexOf(ownedStudio.id)).toBeLessThan(
        ids.indexOf(memberStudio.id),
      );
    });

    test("With no owned or member studios should return an empty list", async () => {
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
