import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import user from "models/user";
import password from "models/password";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/users", () => {
  describe("Anonymous user", () => {
    test("With unique and valid data should return 201 Created", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "John Doe",
          email: "test@pedro.tec.br",
          password: "password",
        }),
      });
      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "john doe",
        features: ["read:activation_token"],
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();

      // Check if the correct password is valid
      const userInDatabase = await user.findOneByUsername("john doe");
      const isPasswordValid = await password.compare(
        "password",
        userInDatabase.password,
      );
      expect(isPasswordValid).toBe(true);

      // Check if the wrong password is not valid
      const isPasswordInvalid = await password.compare(
        "wrong-password",
        userInDatabase.password,
      );
      expect(isPasswordInvalid).toBe(false);
    });

    test("With null password should return 201 Created and store a null password", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "Jane Doe",
          email: "jane@pedro.tec.br",
          password: null,
        }),
      });
      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "jane doe",
        features: ["read:activation_token"],
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      const userInDatabase = await user.findOneByUsername("jane doe");
      expect(userInDatabase.password).toBeNull();
    });

    test("With invalid password type should return 400", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "Bad Password",
          email: "badpassword@pedro.tec.br",
          password: 12345,
        }),
      });
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
      expect(responseBody.action).toBe("Check the fields and try again");
    });

    test("With duplicate username", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "John Doe",
          email: "testsameusername@pedro.tec.br",
          password: "password",
        }),
      });
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "User with username John Doe already exists",
        name: "ValidationError",
        action: "Try another username",
        status_code: 400,
      });
    });

    test("With duplicate email", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "John Doe 2",
          email: "Test@pedro.tec.br",
          password: "password",
        }),
      });
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "User with email Test@pedro.tec.br already exists",
        name: "ValidationError",
        action: "Try another email",
        status_code: 400,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With unique and valid data should return 403 Forbidden", async () => {
      const authenticatedUser = await orchestrator.createUser();
      await orchestrator.activateUser(authenticatedUser.id);
      const authenticatedSession = await orchestrator.createSession(
        authenticatedUser.id,
      );

      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${authenticatedSession.token}`,
        },
        body: JSON.stringify({
          username: "John Doe",
          email: "test@pedro.tec.br",
          password: "password",
        }),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:user",
        status_code: 403,
      });
    });
  });
});
