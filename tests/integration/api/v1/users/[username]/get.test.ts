import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/users/[username]", () => {
  describe("Anonymous user", () => {
    test("With exact case match", async () => {

      // Create a user
      const createUserResponse = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "same-case",
          email: "same-case@pedro.tec.br",
          password: "password",
        }),
      });
      expect(createUserResponse.status).toBe(201);

      const response = await fetch("http://localhost:3000/api/v1/users/same-case", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      });
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "same-case",
        email: "same-case@pedro.tec.br",
        password: "password",
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();
    });

    test("With different case match", async () => {

      // Create a user
      const createUserResponse = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "Same-User",
          email: "same-user@pedro.tec.br",
          password: "password",
        }),
      });
      expect(createUserResponse.status).toBe(201);

      const response = await fetch("http://localhost:3000/api/v1/users/same-user", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      });
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "same-user",
        email: "same-user@pedro.tec.br",
        password: "password",
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();
    });

    test("With non-existent username", async () => {
      const response = await fetch("http://localhost:3000/api/v1/users/non-existent", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      });
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "User with username non-existent not found",
        name: "NotFoundError",
        action: "Try another username",
        status_code: 404,
      });
    });
  });
});
