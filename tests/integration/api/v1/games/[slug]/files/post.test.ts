import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/games/[slug]/files", () => {
  describe("Authenticated owner with feature", () => {
    test("Should return 201 and register the file", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, [
        "create:game",
        "create:game_file",
      ]);
      const game = await orchestrator.createGame(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
        {
          method: "POST",
          headers: {
            Cookie: `session_id=${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            display_name: "Windows Build v1.0",
            platform: "WINDOWS",
            file_url: `games/${game.id}/files/123-game.exe`,
            size_bytes: 1024567,
            version: "v1.0.0",
          }),
        },
      );

      expect(response.status).toBe(201);
      const responseBody = await response.json();

      expect(responseBody.display_name).toBe("Windows Build v1.0");
      expect(responseBody.platform).toBe("WINDOWS");
      expect(responseBody.size_bytes).toBe("1024567"); // Returns as string because of BigInt
    });
  });
});
