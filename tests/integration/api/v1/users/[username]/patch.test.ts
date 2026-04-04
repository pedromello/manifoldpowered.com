import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import password from "models/password";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/users/[username]", () => {
  describe("Anonymous user", () => {
    test("With non-existent username", async () => {
      const response = await fetch(
        "http://localhost:3000/api/v1/users/non-existent",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
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
      await orchestrator.createUser({
        username: "user1",
      });

      await orchestrator.createUser({
        username: "user2",
      });

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/user1`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
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

    test("With duplicate email", async () => {
      const user1 = await orchestrator.createUser({
        email: "testsameemail@pedro.tec.br",
      });

      const user2 = await orchestrator.createUser({
        email: "testsameemail2@pedro.tec.br",
      });

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
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

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1.username}`,
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
      expect(patchResponse.status).toBe(200);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        id: user1.id,
        username: "uniqueuser2",
        email: user1.email,
        password: user1.password,
        features: [],
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
      const user = await orchestrator.createUser();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "testemail2@pedro.tec.br",
          }),
        },
      );
      expect(patchResponse.status).toBe(200);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        id: user.id,
        username: user.username,
        email: "testemail2@pedro.tec.br",
        password: user.password,
        features: [],
        created_at: user.created_at.toISOString(),
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > patchResponseBody.created_at).toBe(
        true,
      );
    });

    test("With valid password", async () => {
      const user = await orchestrator.createUser();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
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
        email: user.email,
        password: patchResponseBody.password,
        features: [],
        created_at: user.created_at.toISOString(),
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > patchResponseBody.created_at).toBe(
        true,
      );

      const isPasswordValid = await password.compare(
        "new-password",
        patchResponseBody.password,
      );
      expect(isPasswordValid).toBe(true);
    });
  });
});
