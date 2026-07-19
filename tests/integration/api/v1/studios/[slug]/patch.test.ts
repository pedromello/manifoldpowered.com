import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/studios/[slug]", () => {
  describe("Anonymous user", () => {
    test("With valid body should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
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
        action: "Verify your user has the following features: update:studio",
        status_code: 403,
      });
    });
  });

  describe("Owner", () => {
    test("With valid body should update the studio and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id, {
        name: "Old Name",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ name: "New Name", is_publisher: true }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("New Name");
      expect(responseBody.slug).toBe("new-name");
      expect(responseBody.is_publisher).toBe(true);
      expect(responseBody.owner_id).toBe(owner.id);
    });
  });

  describe("Unrelated activated user", () => {
    test("Targeting a studio they do not own or administer should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
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
        message: "You do not have permission to update this studio",
        name: "ForbiddenError",
        action: "Verify if you are an administrator of this studio",
        status_code: 403,
      });
    });
  });

  describe("Studio member with update:studio permission", () => {
    test("Should update the studio and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStudioMember(createdStudio.id, member.username, [
        "update:studio",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
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

  describe("Studio member without update:studio permission", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStudioMember(createdStudio.id, member.username, [
        "manage:studio_members",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
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

  describe("Platform administrator (update:studio:any)", () => {
    test("Should update any studio and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const admin = await orchestrator.createUser();
      await orchestrator.activateUser(admin.id);
      await orchestrator.addFeaturesToUser(admin.id, ["update:studio:any"]);
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
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
