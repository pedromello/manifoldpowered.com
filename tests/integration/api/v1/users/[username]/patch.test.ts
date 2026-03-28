import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import user from "models/user";
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
      const user1Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "user1",
          email: "testsameusername@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user1Response.status).toBe(201);

      const user2Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "user2",
          email: "testsameusername2@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user2Response.status).toBe(201);

      const user1ResponseBody = await user1Response.json();
      const user2ResponseBody = await user2Response.json();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1ResponseBody.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: user2ResponseBody.username,
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
      const user1Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "mail1",
          email: "testsameemail@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user1Response.status).toBe(201);

      const user2Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "mail2",
          email: "testsameemail2@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user2Response.status).toBe(201);

      const user1ResponseBody = await user1Response.json();
      const user2ResponseBody = await user2Response.json();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1ResponseBody.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user2ResponseBody.email,
          }),
        },
      );
      expect(patchResponse.status).toBe(400);

      const patchResponseBody = await patchResponse.json();
      expect(patchResponseBody).toEqual({
        message: `User with email ${user2ResponseBody.email} already exists`,
        name: "ValidationError",
        action: "Try another email",
        status_code: 400,
      });
    });

    test("With valid username", async () => {
      const user1Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "useuniqueuser1",
          email: "testsameusername1@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user1Response.status).toBe(201);

      const user1ResponseBody = await user1Response.json();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1ResponseBody.username}`,
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
        id: user1ResponseBody.id,
        username: "uniqueuser2",
        email: "testsameusername1@pedro.tec.br",
        password: user1ResponseBody.password,
        created_at: user1ResponseBody.created_at,
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > user1ResponseBody.created_at).toBe(
        true,
      );
    });

    test("With valid email", async () => {
      const user1Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "useuniqueuser1",
          email: "testemail1@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user1Response.status).toBe(201);

      const user1ResponseBody = await user1Response.json();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1ResponseBody.username}`,
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
        id: user1ResponseBody.id,
        username: "useuniqueuser1",
        email: "testemail2@pedro.tec.br",
        password: user1ResponseBody.password,
        created_at: user1ResponseBody.created_at,
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > user1ResponseBody.created_at).toBe(
        true,
      );
    });

    test("With valid password", async () => {
      const user1Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "uniquepassword1",
          email: "testpassword1@pedro.tec.br",
          password: "password",
        }),
      });
      expect(user1Response.status).toBe(201);

      const user1ResponseBody = await user1Response.json();

      const patchResponse = await fetch(
        `http://localhost:3000/api/v1/users/${user1ResponseBody.username}`,
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
        id: user1ResponseBody.id,
        username: "uniquepassword1",
        email: "testpassword1@pedro.tec.br",
        password: patchResponseBody.password,
        created_at: user1ResponseBody.created_at,
        updated_at: patchResponseBody.updated_at,
      });

      expect(uuidVersion(patchResponseBody.id)).toBe(4);
      expect(Date.parse(patchResponseBody.created_at)).not.toBeNaN();
      expect(Date.parse(patchResponseBody.updated_at)).not.toBeNaN();
      expect(patchResponseBody.updated_at > user1ResponseBody.created_at).toBe(
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
