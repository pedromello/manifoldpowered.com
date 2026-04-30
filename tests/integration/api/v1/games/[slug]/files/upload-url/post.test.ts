import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

describe("POST /api/v1/games/[slug]/files/upload-url", () => {
  describe("Anonymous user", () => {
    test("Should return 401 Unauthorized", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/some-game/files/upload-url`,
        { method: "POST" },
      );
      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:game_file",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user without ownership/feature", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, [
        "create:game",
        "create:game_file",
      ]);
      const game = await orchestrator.createGame(owner.id);

      const attacker = await orchestrator.createUser({
        username: "attacker",
        email: "attacker@test.com",
      });
      await orchestrator.activateUser(attacker.id);
      await orchestrator.addFeaturesToUser(attacker.id, ["create:game_file"]);
      const session = await orchestrator.createSession(attacker.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files/upload-url`,
        {
          method: "POST",
          headers: {
            Cookie: `session_id=${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: "game.exe",
            content_type: "application/octet-stream",
            size_bytes: 1024,
          }),
        },
      );

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You are not allowed to upload files for this game",
        name: "ForbiddenError",
        action: "Make sure you are the owner of the game",
        status_code: 403,
      });
    });
  });

  describe("Authenticated owner with feature", () => {
    test("Should return 200 and a presigned URL", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, [
        "create:game",
        "create:game_file",
      ]);
      const game = await orchestrator.createGame(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files/upload-url`,
        {
          method: "POST",
          headers: {
            Cookie: `session_id=${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: "game.exe",
            content_type: "application/octet-stream",
            size_bytes: 1024,
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();

      expect(responseBody.upload_url).toContain("http://");
      expect(responseBody.object_key).toContain(`games/${game.id}/files/`);

      // Actually upload a file using the presigned URL
      const uploadResponse = await fetch(responseBody.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: "fake game binary data",
      });

      expect(uploadResponse.status).toBe(200);
    });
  });
});
