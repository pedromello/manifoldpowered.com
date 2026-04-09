import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import session from "models/session";
import setCookieParser from "set-cookie-parser";
import webserver from "infra/webserver";

const DO_NOT_FAKE_TIMERS_FOR_PRISMA: FakeableAPI[] = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
];

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/sessions", () => {
  describe("Default user", () => {
    test("With valid session", async () => {
      const createdUser = await orchestrator.createUser({
        username: "UserWithValidSession",
      });

      const createdSession = await orchestrator.createSession(createdUser.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "DELETE",
        headers: {
          Cookie: `session_id=${createdSession.token}`,
        },
      });
      // Return assertions
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: createdSession.id,
        token: createdSession.token,
        user_id: createdUser.id,
        expires_at: responseBody.expires_at,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();
      expect(Date.parse(responseBody.expires_at)).not.toBeNaN();

      const expiresAt = new Date(responseBody.expires_at);
      const updatedAt = new Date(responseBody.updated_at);

      expect(expiresAt < createdSession.expires_at).toBe(true);
      expect(updatedAt > createdSession.updated_at).toBe(true);

      const parsedSetCookie = setCookieParser.parse(response, {
        map: true,
      });
      expect(parsedSetCookie.session_id).toEqual({
        name: "session_id",
        value: "invalid",
        maxAge: -1,
        path: "/",
        httpOnly: true,
      });

      // Now it should not be possible use the session again
      const doubleCheckResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/user`,
        {
          headers: {
            Cookie: `session_id=${createdSession.token}`,
          },
        },
      );
      expect(doubleCheckResponse.status).toBe(401);
    });

    test("With unexistent session", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "DELETE",
        headers: {
          Cookie: `session_id=${crypto.randomUUID()}`,
        },
      });
      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "UnauthorizedError",
        message: "User does not have a valid session",
        action: "Check if user is logged in and try again",
        status_code: 401,
      });
    });

    test("With expired session", async () => {
      jest.useFakeTimers({
        now: new Date(Date.now() - session.EXPIRATION_IN_MILLISECONDS),
        doNotFake: DO_NOT_FAKE_TIMERS_FOR_PRISMA,
      });

      const createdUser = await orchestrator.createUser({
        username: "UserWithExpiredSession",
      });
      const createdSession = await orchestrator.createSession(createdUser.id);

      jest.useRealTimers();

      const response = await fetch(`${webserver.getOrigin()}/api/v1/sessions`, {
        method: "DELETE",
        headers: {
          Cookie: `session_id=${createdSession.token}`,
        },
      });
      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "UnauthorizedError",
        message: "User does not have a valid session",
        action: "Check if user is logged in and try again",
        status_code: 401,
      });
    });
  });
});
