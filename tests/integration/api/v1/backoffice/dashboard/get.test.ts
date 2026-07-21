import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function fetchDashboard(sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/dashboard`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

describe("GET /api/v1/backoffice/dashboard", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetchDashboard();
      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: read:dashboard:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const nonAdmin = await orchestrator.createUser();
      await orchestrator.activateUser(nonAdmin.id);
      const session = await orchestrator.createSession(nonAdmin.id);

      const response = await fetchDashboard(session.token);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Should return games/users/studios/stores metrics", async () => {
      await orchestrator.clearDatabaseRows();

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);

      const pendingGame = await orchestrator.createGame(owner.id, {
        title: "Pending Dashboard Game",
      });
      const activeGame = await orchestrator.createGame(owner.id, {
        title: "Active Dashboard Game",
      });
      await gameModel.makePublic(activeGame.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchDashboard(session.token);
      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.games.pending_count).toBe(1);
      expect(
        body.games.oldest_pending.map((g: { id: string }) => g.id),
      ).toEqual([pendingGame.id]);
      expect(body.games.by_status).toEqual({
        ACTIVE: 1,
        INACTIVE: 0,
        PRIVATE: 1,
      });

      // owner + admin were both created within the last 7 days
      expect(body.users.total).toBe(2);
      expect(body.users.signups_last_7_days).toBe(2);
      expect(body.users.signups_previous_7_days).toBe(0);

      expect(body.studios.total).toBeGreaterThanOrEqual(1);
      expect(body.stores.total).toBe(0);
    });

    test("Oldest pending games are sorted oldest-first and capped at 5", async () => {
      await orchestrator.clearDatabaseRows();

      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);

      const games = [];
      for (let i = 0; i < 6; i++) {
        games.push(
          await orchestrator.createGame(owner.id, { title: `Pending ${i}` }),
        );
      }

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchDashboard(session.token);
      const body = await response.json();

      expect(body.games.pending_count).toBe(6);
      expect(body.games.oldest_pending).toHaveLength(5);
      expect(
        body.games.oldest_pending.map((g: { id: string }) => g.id),
      ).toEqual(games.slice(0, 5).map((g) => g.id));
    });
  });
});
