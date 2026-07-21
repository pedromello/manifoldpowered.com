import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function fetchBackofficeStudio(slug: string, sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/studios/${slug}`, {
    headers: sessionToken ? { Cookie: `session_id=${sessionToken}` } : {},
  });
}

describe("GET /api/v1/backoffice/studios/[slug]", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      const createdStudio = await orchestrator.createStudio(owner.id);

      const response = await fetchBackofficeStudio(createdStudio.slug);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Should return the studio plus its games, including PRIVATE ones", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);
      await orchestrator.createGame(owner.id, {
        title: "Studio Detail Game",
        studio_id: createdStudio.id,
      });

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeStudio(
        createdStudio.slug,
        session.token,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.studio.id).toBe(createdStudio.id);
      expect(body.games).toHaveLength(1);
      expect(body.games[0].title).toBe("Studio Detail Game");
      expect(body.games[0].status).toBe("PRIVATE");
    });

    test("With an unknown slug should return 404 Not Found", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await fetchBackofficeStudio(
        "does-not-exist",
        session.token,
      );
      expect(response.status).toBe(404);
    });
  });
});
