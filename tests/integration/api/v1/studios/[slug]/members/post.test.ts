import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/studios/[slug]/members", () => {
  describe("Anonymous user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "someone",
            permissions: ["update:studio"],
          }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: manage:studio_members",
        status_code: 403,
      });
    });
  });

  describe("Owner", () => {
    test("With valid body should add a member and return 201", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const targetUser = await orchestrator.createUser();
      await orchestrator.activateUser(targetUser.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            username: targetUser.username,
            permissions: ["update:studio"],
          }),
        },
      );

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        studio_id: createdStudio.id,
        user_id: targetUser.id,
        username: targetUser.username,
        permissions: ["update:studio"],
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });
    });

    test("Adding the same member twice should return 400", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const targetUser = await orchestrator.createUser();
      await orchestrator.activateUser(targetUser.id);
      await orchestrator.addStudioMember(
        createdStudio.id,
        targetUser.username,
        ["update:studio"],
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            username: targetUser.username,
            permissions: ["manage:studio_members"],
          }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });

    test("Adding the studio owner as a member should return 400", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            username: owner.username,
            permissions: ["update:studio"],
          }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });

    test("With invalid permission value should return 400", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const targetUser = await orchestrator.createUser();
      await orchestrator.activateUser(targetUser.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({
            username: targetUser.username,
            permissions: ["delete:everything"],
          }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });
  });

  describe("Unrelated activated user", () => {
    test("Targeting a studio they do not administer should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const targetUser = await orchestrator.createUser();
      await orchestrator.activateUser(targetUser.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({
            username: targetUser.username,
            permissions: ["update:studio"],
          }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to manage this studio's members",
        name: "ForbiddenError",
        action: "Verify if you are an administrator of this studio",
        status_code: 403,
      });
    });
  });
});
