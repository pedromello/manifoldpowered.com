import orchestrator from "tests/orchestrator";
import otp from "models/otp";
import session from "models/session";
import setCookieParser from "set-cookie-parser";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/otp/sessions", () => {
  describe("Anonymous user", () => {
    test("With valid and unexpired code should create a session and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);

      const { code } = await otp.create(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code }),
        },
      );

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        token: responseBody.token,
        user_id: user.id,
        expires_at: responseBody.expires_at,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      const parsedSetCookie = setCookieParser(response, { map: true });
      expect(parsedSetCookie.session_id).toEqual({
        name: "session_id",
        value: responseBody.token,
        path: "/",
        maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000,
        httpOnly: true,
        sameSite: "Lax",
      });
    });

    test("With invalid code should return 401", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await otp.create(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code: "000000" }),
        },
      );

      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Invalid or expired code",
        name: "UnauthorizedError",
        action: "Request a new code and try again",
        status_code: 401,
      });
    });

    test("With non-existent email should return 401", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "non-existent@pedro.tec.br",
            code: "123456",
          }),
        },
      );

      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Invalid or expired code",
        name: "UnauthorizedError",
        action: "Request a new code and try again",
        status_code: 401,
      });
    });

    test("With expired code should return 401", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);

      jest.useFakeTimers({
        now: Date.now() - otp.EXPIRATION_IN_MILLISECONDS - 3000,
        doNotFake: orchestrator.DO_NOT_FAKE_TIMERS_FOR_PRISMA as FakeableAPI[],
      });

      const { code } = await otp.create(user.id);

      jest.useRealTimers();

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code }),
        },
      );

      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Invalid or expired code",
        name: "UnauthorizedError",
        action: "Request a new code and try again",
        status_code: 401,
      });
    });

    test("With already used code should return 401", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const { code } = await otp.create(user.id);

      const firstResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code }),
        },
      );
      expect(firstResponse.status).toBe(201);

      const secondResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code }),
        },
      );

      expect(secondResponse.status).toBe(401);

      const responseBody = await secondResponse.json();
      expect(responseBody).toEqual({
        message: "Invalid or expired code",
        name: "UnauthorizedError",
        action: "Request a new code and try again",
        status_code: 401,
      });
    });

    test("With unactivated user should return 403", async () => {
      const user = await orchestrator.createUser();
      const { code } = await otp.create(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to login",
        name: "ForbiddenError",
        action: "Contact support if you believe this is an error",
        status_code: 403,
      });
    });

    test("With invalid body should return 400", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/otp/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "not-an-email", code: "1" }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });
  });
});
