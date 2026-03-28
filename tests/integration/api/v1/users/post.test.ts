import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import user from "models/user";
import password from "models/password";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/users", () => {
  describe("Anonymous user", () => {
    test("With unique and valid data should return 201 Created", async () => {
      const response = await fetch("http://localhost:3000/api/v1/users", {
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
        email: "test@pedro.tec.br",
        password: responseBody.password,
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

    test("With duplicate username", async () => {
      const response = await fetch("http://localhost:3000/api/v1/users", {
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
      const response = await fetch("http://localhost:3000/api/v1/users", {
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
});
