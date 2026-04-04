import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/users/[username]", () => {
  describe("Anonymous user", () => {
    test("With exact case match", async () => {
      const user = await orchestrator.createUser({
        username: "same-case",
      });

      const response = await fetch(
        "http://localhost:3000/api/v1/users/same-case",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "same-case",
        email: user.email,
        password: responseBody.password,
        features: [],
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();
    });

    test("With different case match", async () => {
      const user = await orchestrator.createUser({
        username: "Same-User",
      });

      const response = await fetch(
        "http://localhost:3000/api/v1/users/saMe-usEr",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "same-user",
        email: user.email,
        password: responseBody.password,
        features: [],
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();
    });

    test("With non-existent username", async () => {
      const response = await fetch(
        "http://localhost:3000/api/v1/users/non-existent",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
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
  });
});
