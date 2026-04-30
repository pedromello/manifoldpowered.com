import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameFile from "models/game_file";
import storage from "infra/storage";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

describe("DELETE /api/v1/games/[slug]/files/[file_id]", () => {
  describe("Authenticated owner with feature", () => {
    test("Should return 204 and delete the file from both DB and S3", async () => {
      // 1. Create Game and Owner
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, [
        "create:game",
        "create:game_file",
        "delete:game_file",
      ]);
      const game = await orchestrator.createGame(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);

      // 2. Upload file via presigned URL
      const ownerUploadResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files/upload-url`,
        {
          method: "POST",
          headers: {
            Cookie: `session_id=${ownerSession.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: "delete-me.exe",
            content_type: "application/octet-stream",
            size_bytes: 1024,
          }),
        },
      );
      const ownerUploadBody = await ownerUploadResponse.json();

      await fetch(ownerUploadBody.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: "delete me from minio",
      });

      // 3. Register GameFile
      const file = await gameFile.create({
        game_id: game.id,
        display_name: "Windows Build v1.0",
        platform: "WINDOWS",
        file_url: ownerUploadBody.object_key,
        size_bytes: 1024,
        version: "v1.0.0",
      });

      // 4. Verify file exists in S3 (download works)
      const verifyUrl = await storage.getDownloadUrl(
        ownerUploadBody.object_key,
      );
      const preDeleteResponse = await fetch(verifyUrl);
      expect(preDeleteResponse.status).toBe(200);

      // 5. DELETE the file using the endpoint
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files/${file.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(204);

      // 6. Verify file no longer exists in S3
      const verifyDeletedUrl = await storage.getDownloadUrl(
        ownerUploadBody.object_key,
      );
      const postDeleteResponse = await fetch(verifyDeletedUrl);
      expect(postDeleteResponse.status).toBe(404); // S3 returns 404 for missing objects
    });
  });

  describe("Authenticated user without ownership", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, ["create:game"]);
      const game = await orchestrator.createGame(owner.id);

      const file = await gameFile.create({
        game_id: game.id,
        display_name: "Windows Build v1.0",
        platform: "WINDOWS",
        file_url: `games/${game.id}/files/123-game.exe`,
        size_bytes: 1024567,
        version: "v1.0.0",
      });

      const attacker = await orchestrator.createUser({
        username: "attacker",
        email: "attacker@test.com",
      });
      await orchestrator.activateUser(attacker.id);
      await orchestrator.addFeaturesToUser(attacker.id, ["delete:game_file"]); // Give feature, but not ownership
      const session = await orchestrator.createSession(attacker.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files/${file.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${session.token}` },
        },
      );

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You are not allowed to delete files for this game",
        name: "ForbiddenError",
        action: "Make sure you are the owner of the game",
        status_code: 403,
      });
    });
  });
});
