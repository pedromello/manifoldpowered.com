import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import auditLog from "models/audit_log";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function patchStatus(slug: string, body: object, sessionToken?: string) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/games/${slug}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH /api/v1/backoffice/games/[slug]/status", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      const game = await orchestrator.createGame(owner.id);

      const response = await patchStatus(game.slug, { status: "ACTIVE" });
      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: update:game:status:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden, even for their own game", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const session = await orchestrator.createSession(owner.id);
      const game = await orchestrator.createGame(owner.id);

      const response = await patchStatus(
        game.slug,
        { status: "ACTIVE" },
        session.token,
      );
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Approving a game (ACTIVE) does not require a reason", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchStatus(
        game.slug,
        { status: "ACTIVE" },
        session.token,
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.status).toBe("ACTIVE");

      const { logs } = await auditLog.findAllPaginated({
        target_type: "game",
        target_id: game.id,
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].admin_user_id).toBe(admin.id);
      expect(logs[0].action).toBe("game:status:update");
      expect(logs[0].reason).toBeNull();
    });

    test("Rejecting a game (PRIVATE) without a reason returns 400", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchStatus(
        game.slug,
        { status: "PRIVATE" },
        session.token,
      );
      expect(response.status).toBe(400);
    });

    test("Rejecting a game (PRIVATE) with a reason succeeds and is logged", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const game = await orchestrator.createGame(owner.id);
      await (await import("models/game")).default.makePublic(game.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchStatus(
        game.slug,
        { status: "PRIVATE", reason: "Missing store page assets" },
        session.token,
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.status).toBe("PRIVATE");

      const { logs } = await auditLog.findAllPaginated({
        target_type: "game",
        target_id: game.id,
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].reason).toBe("Missing store page assets");
    });

    test("With an unknown slug should return 404 Not Found", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchStatus(
        "does-not-exist",
        { status: "ACTIVE" },
        session.token,
      );
      expect(response.status).toBe(404);
    });

    test("With an invalid status value should return 400", async () => {
      const owner = await orchestrator.createUser();
      const game = await orchestrator.createGame(owner.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchStatus(
        game.slug,
        { status: "NOT_A_REAL_STATUS" },
        session.token,
      );
      expect(response.status).toBe(400);
    });
  });
});
