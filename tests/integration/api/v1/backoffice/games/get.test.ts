import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function fetchBackofficeGames(query = "", sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/games${query}`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

describe("GET /api/v1/backoffice/games", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetchBackofficeGames();
      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: read:game:any",
        status_code: 403,
      });
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const nonAdmin = await orchestrator.createUser();
      await orchestrator.activateUser(nonAdmin.id);
      const session = await orchestrator.createSession(nonAdmin.id);

      const response = await fetchBackofficeGames("", session.token);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Should return every game regardless of status, including PRIVATE ones", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);

      const publicGame = await orchestrator.createGame(owner.id, {
        title: "Backoffice Public Game",
      });
      await gameModel.makePublic(publicGame.id);
      await orchestrator.createGame(owner.id, {
        title: "Backoffice Private Game",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeGames("", session.token);
      expect(response.status).toBe(200);

      const body = await response.json();
      const titles = body.games.map((backofficeGame) => backofficeGame.title);
      expect(titles).toContain("Backoffice Public Game");
      expect(titles).toContain("Backoffice Private Game");
    });

    test("Should filter by status", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createGame(owner.id, {
        title: "Only Pending Game",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeGames(
        "?status=PRIVATE",
        session.token,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(
        body.games.every(
          (backofficeGame) => backofficeGame.status === "PRIVATE",
        ),
      ).toBe(true);
    });

    test("Should sort PRIVATE games oldest-first (review queue order)", async () => {
      await orchestrator.clearDatabaseRows();
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);

      const older = await orchestrator.createGame(owner.id, {
        title: "Older Pending",
      });
      const newer = await orchestrator.createGame(owner.id, {
        title: "Newer Pending",
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeGames(
        "?status=PRIVATE",
        session.token,
      );
      const body = await response.json();

      expect(body.games.map((backofficeGame) => backofficeGame.id)).toEqual([
        older.id,
        newer.id,
      ]);
    });
  });
});
