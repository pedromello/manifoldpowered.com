import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/stores/[slug]", () => {
  describe("Anonymous user", () => {
    test("With valid body should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Name" }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: update:store",
        status_code: 403,
      });
    });
  });

  describe("Owner", () => {
    test("With valid body should update the store and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id, {
        name: "Old Name",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ name: "New Name" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("New Name");
      expect(responseBody.slug).toBe("new-name");
      expect(responseBody.owner_id).toBe(owner.id);
    });
  });

  describe("Unrelated activated user", () => {
    test("Targeting a store they do not own or administer should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({ name: "Hijacked Name" }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to update this store",
        name: "ForbiddenError",
        action: "Verify if you are an administrator of this store",
        status_code: 403,
      });
    });
  });

  describe("Store member with update:store permission", () => {
    test("Should update the store and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStoreMember(createdStore.id, member.username, [
        "update:store",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${memberSession.token}`,
          },
          body: JSON.stringify({ description: "Updated by member" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.description).toBe("Updated by member");
    });
  });

  describe("Store member without update:store permission", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStoreMember(createdStore.id, member.username, [
        "manage:store_members",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${memberSession.token}`,
          },
          body: JSON.stringify({ description: "Should not work" }),
        },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Platform administrator (update:store:any)", () => {
    test("Should update any store and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const admin = await orchestrator.createUser();
      await orchestrator.activateUser(admin.id);
      await orchestrator.addFeaturesToUser(admin.id, ["update:store:any"]);
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${adminSession.token}`,
          },
          body: JSON.stringify({ description: "Updated by platform admin" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.description).toBe("Updated by platform admin");
    });
  });
});
