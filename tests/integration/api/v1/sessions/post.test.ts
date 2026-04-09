import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import session from "models/session";
import setCookieParser from "set-cookie-parser";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/sessions", () => {
  describe("Anonymous user", () => {
    test("With incorrect email but correct password", async () => {
      await orchestrator.createUser({
        email: "test1@pedro.tec.br",
        password: "password",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "wrong@pedro.tec.br",
          password: "password",
        }),
      });
      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Invalid credentials",
        name: "UnauthorizedError",
        action: "Check your credentials",
        status_code: 401,
      });
    });

    test("With incorrect password but correct email", async () => {
      await orchestrator.createUser({
        email: "test2@pedro.tec.br",
        password: "password",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test2@pedro.tec.br",
          password: "wrong-password",
        }),
      });
      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Invalid credentials",
        name: "UnauthorizedError",
        action: "Check your credentials",
        status_code: 401,
      });
    });

    test("With incorrect password and incorrect email", async () => {
      await orchestrator.createUser();

      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "wrong2@pedro.tec.br",
          password: "wrong-password",
        }),
      });
      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Invalid credentials",
        name: "UnauthorizedError",
        action: "Check your credentials",
        status_code: 401,
      });
    });

    test("With correct email and correct password", async () => {
      const user = await orchestrator.createUser({
        email: "correct@pedro.tec.br",
        password: "correct-password",
      });

      await orchestrator.activateUser(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "correct@pedro.tec.br",
          password: "correct-password",
        }),
      });
      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        token: responseBody.token,
        user_id: responseBody.user_id,
        expires_at: responseBody.expires_at,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(responseBody.token).toHaveLength(96);
      expect(uuidVersion(responseBody.user_id)).toBe(4);
      expect(Date.parse(responseBody.expires_at)).not.toBeNaN();
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();

      const expiresAt = new Date(responseBody.expires_at);
      const createdAt = new Date(responseBody.created_at);

      expect(expiresAt.getTime()).toBeGreaterThan(createdAt.getTime());

      expect(expiresAt >= createdAt).toBe(true);

      const actualLifetimeInMilliseconds =
        expiresAt.getTime() - createdAt.getTime();
      const lifetimeDifferenceInMilliseconds =
        session.EXPIRATION_IN_MILLISECONDS - actualLifetimeInMilliseconds;

      expect(lifetimeDifferenceInMilliseconds).toBeLessThanOrEqual(5000);

      const parsedSetCookie = setCookieParser(response, {
        map: true,
      });
      expect(parsedSetCookie.session_id).toEqual({
        name: "session_id",
        value: responseBody.token,
        path: "/",
        maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000,
        httpOnly: true,
        sameSite: "Lax",
      });
    });
  });
});
