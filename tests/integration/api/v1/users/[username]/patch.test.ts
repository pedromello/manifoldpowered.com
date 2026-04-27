import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import password from "models/password";
import webserver from "infra/webserver";
import user from "models/user";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/users/[username]", () => {
  describe("Anonymous user", () => {
    test("With valid username", async () => {
      const user1 = await orchestrator.createUser();

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${user1.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "uniqueuser2",
          }),
        },
      );
      expect(patchResponse.status).toBe(403);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: update:user",
        status_code: 403,
      });
    });
  });

  describe("Default user", () => {
    test("With non-existent username", async () => {
      const createdUser = await orchestrator.createUser();
      await orchestrator.activateUser(createdUser.id);
      const sessionObj = await orchestrator.createSession(createdUser.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/users/non-existent`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj.token}`,
          },
          body: JSON.stringify({
            username: "new-username",
          }),
        },
      );
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "User with username non-existent not found",
        name: "NotFoundError",
        action: "Try another username",
        status_code: 404,
      });
    });

    test("With duplicate username", async () => {
      const user1 = await orchestrator.createUser({
        username: "user1",
      });
      await orchestrator.activateUser(user1.id);
      const sessionObj1 = await orchestrator.createSession(user1.id);

      await orchestrator.createUser({
        username: "user2",
      });

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/user1`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj1.token}`,
          },
          body: JSON.stringify({
            username: "user2",
          }),
        },
      );
      expect(patchResponse.status).toBe(400);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        message: "User with username user2 already exists",
        name: "ValidationError",
        action: "Try another username",
        status_code: 400,
      });
    });

    test("With user1 targeting user2", async () => {
      const user1 = await orchestrator.createUser();
      await orchestrator.activateUser(user1.id);
      const sessionObj1 = await orchestrator.createSession(user1.id);

      const user2 = await orchestrator.createUser();

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${user2.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj1.token}`,
          },
          body: JSON.stringify({
            username: "uniqueuser2",
          }),
        },
      );
      expect(patchResponse.status).toBe(403);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        message: "You do not have permission to update another user",
        name: "ForbiddenError",
        action: "Verify your user has authorization to update other users",
        status_code: 403,
      });
    });

    test("With duplicate email", async () => {
      const user1 = await orchestrator.createUser({
        email: "testsameemail@pedro.tec.br",
      });
      await orchestrator.activateUser(user1.id);
      const sessionObj1 = await orchestrator.createSession(user1.id);

      const user2 = await orchestrator.createUser({
        email: "testsameemail2@pedro.tec.br",
      });

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${user1.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj1.token}`,
          },
          body: JSON.stringify({
            email: user2.email,
          }),
        },
      );
      expect(patchResponse.status).toBe(400);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        message: `User with email ${user2.email} already exists`,
        name: "ValidationError",
        action: "Try another email",
        status_code: 400,
      });
    });

    test("With valid username", async () => {
      const user1 = await orchestrator.createUser();
      await orchestrator.activateUser(user1.id);
      const sessionObj1 = await orchestrator.createSession(user1.id);

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${user1.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj1.token}`,
          },
          body: JSON.stringify({
            username: "uniqueuser2",
          }),
        },
      );
      expect(patchResponse.status).toBe(200);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        id: user1.id,
        username: "uniqueuser2",
        features: [
          "create:session",
          "read:session",
          "update:user",
          "read:public_game",
        ],
        created_at: user1.created_at.toISOString(),
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > patchResponseBody.created_at).toBe(
        true,
      );
    });

    test("With valid email", async () => {
      const createdUser = await orchestrator.createUser();
      await orchestrator.activateUser(createdUser.id);
      const sessionObj = await orchestrator.createSession(createdUser.id);

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${createdUser.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj.token}`,
          },
          body: JSON.stringify({
            email: "testemail2@pedro.tec.br",
          }),
        },
      );
      expect(patchResponse.status).toBe(200);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        id: createdUser.id,
        username: createdUser.username,
        features: [
          "create:session",
          "read:session",
          "update:user",
          "read:public_game",
        ],
        created_at: createdUser.created_at.toISOString(),
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > patchResponseBody.created_at).toBe(
        true,
      );

      const userInDatabase = await user.findOneByUsername(createdUser.username);

      expect(userInDatabase.email).toBe("testemail2@pedro.tec.br");
    });

    test("With valid password", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const sessionObj = await orchestrator.createSession(user.id);

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${user.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObj.token}`,
          },
          body: JSON.stringify({
            password: "new-password",
          }),
        },
      );
      expect(patchResponse.status).toBe(200);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        id: user.id,
        username: user.username,
        features: [
          "create:session",
          "read:session",
          "update:user",
          "read:public_game",
        ],
        created_at: user.created_at.toISOString(),
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > patchResponseBody.created_at).toBe(
        true,
      );

      const updatedUser = await orchestrator.getUserById(user.id);

      const isPasswordValid = await password.compare(
        "new-password",
        updatedUser.password,
      );
      expect(isPasswordValid).toBe(true);
    });
  });

  describe("Privileged user", () => {
    test("With update:user:others targeting default user", async () => {
      const privilegedUser = await orchestrator.createUser();
      await orchestrator.activateUser(privilegedUser.id);
      const privilegedUserSession = await orchestrator.createSession(
        privilegedUser.id,
      );

      await orchestrator.addFeaturesToUser(privilegedUser.id, [
        "update:user:others",
      ]);

      const userToPatch = await orchestrator.createUser();
      await orchestrator.activateUser(userToPatch.id);

      const patchResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${userToPatch.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${privilegedUserSession.token}`,
          },
          body: JSON.stringify({
            username: "changedByPrivilegedUser",
          }),
        },
      );
      expect(patchResponse.status).toBe(200);

      const patchResponseBody = await patchResponse.json();

      expect(patchResponseBody).toEqual({
        id: userToPatch.id,
        username: "changedByPrivilegedUser",
        features: [
          "create:session",
          "read:session",
          "update:user",
          "read:public_game",
        ],
        created_at: userToPatch.created_at.toISOString(),
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > patchResponseBody.created_at).toBe(
        true,
      );
    });
  });
});
