import orchestrator from "tests/orchestrator";
import activation from "models/activation";
import user from "models/user";
import { version as uuidVersion } from "uuid";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

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

describe("PATCH /api/v1/activations/[activation_id]", () => {
  describe("Anonymous user", () => {
    test("With unexisting token", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/00000000-0000-0000-0000-000000000000`,
        {
          method: "PATCH",
        },
      );
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Activation not found",
        name: "NotFoundError",
        action: "Do the signup again",
        status_code: 404,
      });
    });

    test("With expired token", async () => {
      jest.useFakeTimers({
        now: Date.now() - activation.EXPIRATION_IN_MILLISECONDS - 3000,
        doNotFake: DO_NOT_FAKE_TIMERS_FOR_PRISMA,
      });

      const user = await orchestrator.createUser();
      const expiredActivationToken = await activation.create(user.id);

      jest.useRealTimers();

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${expiredActivationToken.id}`,
        {
          method: "PATCH",
        },
      );
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Activation not found",
        name: "NotFoundError",
        action: "Do the signup again",
        status_code: 404,
      });
    });

    test("With already used token", async () => {
      const user = await orchestrator.createUser();
      const alreadyUsedActivationToken = await activation.create(user.id);

      await activation.markAsUsed(alreadyUsedActivationToken.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${alreadyUsedActivationToken.id}`,
        {
          method: "PATCH",
        },
      );
      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "Activation not found",
        name: "NotFoundError",
        action: "Do the signup again",
        status_code: 404,
      });
    });

    test("With valid token", async () => {
      const createdUser = await orchestrator.createUser();
      const validActivationToken = await activation.create(createdUser.id);

      const activateAccountResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${validActivationToken.id}`,
        {
          method: "PATCH",
        },
      );
      const activationObj = await activateAccountResponse.json();

      expect(activationObj).toEqual({
        id: validActivationToken.id,
        used_at: activationObj.used_at,
        user_id: createdUser.id,
        expires_at: activationObj.expires_at,
        created_at: activationObj.created_at,
        updated_at: activationObj.updated_at,
      });
      expect(activationObj.used_at).not.toBeNull();

      expect(uuidVersion(activationObj.id)).toBe(4);
      expect(uuidVersion(activationObj.user_id)).toBe(4);

      expect(Date.parse(activationObj.expires_at)).not.toBeNaN();
      expect(Date.parse(activationObj.created_at)).not.toBeNaN();
      expect(Date.parse(activationObj.updated_at)).not.toBeNaN();
      expect(activationObj.updated_at > activationObj.created_at).toBe(true);
      expect(activationObj.expires_at > activationObj.created_at).toBe(true);

      const expiresAt = new Date(activationObj.expires_at);
      const createdAt = new Date(activationObj.created_at);

      const diffTimeExpiresAtCreatedAt =
        expiresAt.getTime() - createdAt.getTime();
      // 1s tolerance for time drift
      expect(
        diffTimeExpiresAtCreatedAt - activation.EXPIRATION_IN_MILLISECONDS,
      ).toBeLessThanOrEqual(1000);

      const activatedUser = await user.findOneById(createdUser.id);

      expect(activatedUser.features).toEqual([
        "create:session",
        "read:session",
        "update:user",
      ]);
    });

    test("With valid token but already activated user", async () => {
      const createdUser = await orchestrator.createUser();
      await orchestrator.activateUser(createdUser.id);
      const validActivationToken = await activation.create(createdUser.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${validActivationToken.id}`,
        {
          method: "PATCH",
        },
      );
      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You cannot use activation tokens anymore",
        name: "ForbiddenError",
        action: "Contact support if you believe this is an error",
        status_code: 403,
      });
    });
  });

  describe("Default user", () => {
    test("With user2 valid token, but logged in as user1", async () => {
      const user1 = await orchestrator.createUser();
      await orchestrator.activateUser(user1.id);
      const user1SessionToken = await orchestrator.createSession(user1.id);

      const user2 = await orchestrator.createUser();
      const validUser2ActivationToken = await activation.create(user2.id);

      const activateAccountResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${validUser2ActivationToken.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: `session_id=${user1SessionToken.token}`,
          },
        },
      );
      expect(activateAccountResponse.status).toBe(403);

      const responseBody = await activateAccountResponse.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action:
          "Verify your user has the following features: read:activation_token",
        status_code: 403,
      });
    });
  });
});
