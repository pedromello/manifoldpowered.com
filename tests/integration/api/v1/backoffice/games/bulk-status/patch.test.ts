import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import auditLog from "models/audit_log";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function patchBulkStatus(body: object, sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/games/bulk-status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/backoffice/games/bulk-status", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await patchBulkStatus({
        slugs: ["some-game"],
        status: "ACTIVE",
      });
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Approves multiple games in one request, each with its own audit log entry", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const gameA = await orchestrator.createGame(owner.id, {
        title: "Bulk Game A",
      });
      const gameB = await orchestrator.createGame(owner.id, {
        title: "Bulk Game B",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchBulkStatus(
        { slugs: [gameA.slug, gameB.slug], status: "ACTIVE" },
        session.token,
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(
        responseBody.games.every(
          (bulkGame: { status: string }) => bulkGame.status === "ACTIVE",
        ),
      ).toBe(true);

      const { logs: gameALogs } = await auditLog.findAllPaginated({
        target_type: "game",
        target_id: gameA.id,
      });
      const { logs: gameBLogs } = await auditLog.findAllPaginated({
        target_type: "game",
        target_id: gameB.id,
      });
      expect(gameALogs).toHaveLength(1);
      expect(gameBLogs).toHaveLength(1);
    });

    test("With an unknown slug in the batch returns 404 and updates nothing", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const realGame = await orchestrator.createGame(owner.id, {
        title: "Real Bulk Game",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchBulkStatus(
        { slugs: [realGame.slug, "does-not-exist"], status: "ACTIVE" },
        session.token,
      );
      expect(response.status).toBe(404);

      const { logs } = await auditLog.findAllPaginated({
        target_type: "game",
        target_id: realGame.id,
      });
      expect(logs).toHaveLength(0);
    });
  });
});
