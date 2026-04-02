import orchestrator from "tests/orchestrator";
import { version as uuidVersion } from "uuid";
import session from "models/session";
import setCookieParser from "set-cookie-parser";

const DO_NOT_FAKE_TIMERS_FOR_PRISMA: FakeableAPI[] = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
];

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/user", () => {
  describe("Default user", () => {
    test("With valid session should return 200 OK", async () => {
      const createdUser = await orchestrator.createUser({
        username: "UserWithValidSession"
      });

      const createdSession = await orchestrator.createSession(createdUser.id);

      const response = await fetch("http://localhost:3000/api/v1/user", {
        method: "GET",
        headers: {
          "Cookie": `session_id=${createdSession.token}`,
        },
      });
      // Return assertions
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
        password: createdUser.password,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();

      // Session assertions
      const renewedSession = await session.findOneValidByToken(createdSession.token);
      expect(renewedSession.id).toBe(createdSession.id);
      expect(renewedSession.user_id).toBe(createdUser.id);

      expect(renewedSession.expires_at > createdSession.expires_at).toBe(true);
      expect(renewedSession.updated_at > createdSession.updated_at).toBe(true);

      // Set-Cookie assertions
      const parsedSetCookie = setCookieParser(response, {
        map: true,
      });
      expect(parsedSetCookie.session_id).toEqual({
        name: "session_id",
        value: createdSession.token,
        path: "/",
        maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000,
        httpOnly: true,
      });
    });

    test("With a valid session that is about to expire should return 200 OK", async () => {
      jest.useFakeTimers({
        now: new Date(Date.now() - session.EXPIRATION_IN_MILLISECONDS + 30000), // Advancing 30 seconds so the session is not expired yet (30 seconds before the expiration)
        doNotFake: DO_NOT_FAKE_TIMERS_FOR_PRISMA
      });

      const createdUser = await orchestrator.createUser({
        username: "UserWithSessionAboutToExpire"
      });

      const createdSession = await orchestrator.createSession(createdUser.id);

      jest.useRealTimers();

      expect(createdSession.expires_at > new Date()).toBe(true);

      const response = await fetch("http://localhost:3000/api/v1/user", {
        method: "GET",
        headers: {
          "Cookie": `session_id=${createdSession.token}`,
        },
      });
      expect(response.status).toBe(200);
    });

    test("With unexistent session should return 401 Unauthorized", async () => {
      const response = await fetch("http://localhost:3000/api/v1/user", {
        method: "GET",
        headers: {
          "Cookie": `session_id=${crypto.randomUUID()}`,
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

    test("Without session should return 401 Unauthorized", async () => {
      const response = await fetch("http://localhost:3000/api/v1/user", {
        method: "GET",
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

    test("With expired session should return 401 Unauthorized", async () => {
      jest.useFakeTimers({
        now: new Date(Date.now() - session.EXPIRATION_IN_MILLISECONDS),
        doNotFake: DO_NOT_FAKE_TIMERS_FOR_PRISMA
      });

      const createdUser = await orchestrator.createUser({
        username: "UserWithExpiredSession"
      });
      const createdSession = await orchestrator.createSession(createdUser.id);

      jest.useRealTimers();

      const response = await fetch("http://localhost:3000/api/v1/user", {
        method: "GET",
        headers: {
          "Cookie": `session_id=${createdSession.token}`,
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

