import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: create:store",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test("Returns stores the user owns and stores they are a member of, but not others'", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const ownedStore = await orchestrator.createStore(user.id, {
        name: "Owned Store",
      });

      // A store owned by someone else, that our user is a MEMBER of.
      const otherOwner = await orchestrator.createUser();
      await orchestrator.activateUser(otherOwner.id);
      const memberStore = await orchestrator.createStore(otherOwner.id, {
        name: "Member Store",
      });
      await orchestrator.addStoreMember(memberStore.id, user.username, [
        "update:store",
      ]);

      // A store our user neither owns nor belongs to.
      const unrelatedStore = await orchestrator.createStore(otherOwner.id, {
        name: "Unrelated Store",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const ids = responseBody.stores.map((item: { id: string }) => item.id);
      expect(ids).toContain(ownedStore.id);
      expect(ids).toContain(memberStore.id);
      expect(ids).not.toContain(unrelatedStore.id);
      expect(responseBody.stores).toHaveLength(2);
      expect(responseBody.pagination.total).toBe(2);
    });

    test("Lists owned stores before member-of stores", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      // Owned name sorts AFTER the member name alphabetically, so if owned
      // still comes first the owned-first ordering is proven.
      const ownedStore = await orchestrator.createStore(user.id, {
        name: "Zeta Owned Store",
      });

      const otherOwner = await orchestrator.createUser();
      await orchestrator.activateUser(otherOwner.id);
      const memberStore = await orchestrator.createStore(otherOwner.id, {
        name: "Alpha Member Store",
      });
      await orchestrator.addStoreMember(memberStore.id, user.username, [
        "update:store",
      ]);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        headers: { Cookie: `session_id=${session.token}` },
      });

      const responseBody = await response.json();
      const ids = responseBody.stores.map((item: { id: string }) => item.id);
      expect(ids.indexOf(ownedStore.id)).toBeLessThan(
        ids.indexOf(memberStore.id),
      );
    });

    test("With no owned or member stores should return an empty list", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        headers: { Cookie: `session_id=${session.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.stores).toEqual([]);
      expect(responseBody.pagination.total).toBe(0);
    });
  });
});
