import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import library from "models/library";
import gameFile from "models/game_file";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

describe("GET /api/v1/library/download/[file_id]", () => {
  describe("Authenticated user owning the game", () => {
    test("Should return 200 and a download URL, and file can be downloaded", async () => {
      // 1. Create Game and Owner
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, [
        "create:game",
        "create:game_file",
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
            filename: "123-game.exe",
            content_type: "application/octet-stream",
            size_bytes: 1024,
          }),
        },
      );
      const ownerUploadBody = await ownerUploadResponse.json();

      await fetch(ownerUploadBody.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: "hello world from minio",
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

      // 4. Create the Buyer
      const buyer = await orchestrator.createUser({
        username: "buyer",
        email: "buyer@test.com",
      });
      await orchestrator.activateUser(buyer.id); // This gives them read:library and read:game_file
      const session = await orchestrator.createSession(buyer.id);

      // 5. Add game to buyer's library
      await library.add(buyer.id, game.id, "GAME");

      // 6. Request download link
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/library/download/${file.id}`,
        {
          headers: { Cookie: `session_id=${session.token}` },
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.download_url).toContain("http://");

      // 7. Actually download the file using the presigned URL generated for the buyer
      const downloadResponse = await fetch(responseBody.download_url);
      expect(downloadResponse.status).toBe(200);
      const downloadText = await downloadResponse.text();
      expect(downloadText).toBe("hello world from minio");
    });
  });

  describe("Authenticated user NOT owning the game", () => {
    test("Should return 403 Forbidden", async () => {
      // 1. Create Game and GameFile
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

      // 2. Create the Non-Buyer
      const nonBuyer = await orchestrator.createUser({
        username: "nonbuyer",
        email: "nonbuyer@test.com",
      });
      await orchestrator.activateUser(nonBuyer.id);
      const session = await orchestrator.createSession(nonBuyer.id);

      // 3. Request download link WITHOUT adding to library
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/library/download/${file.id}`,
        {
          headers: { Cookie: `session_id=${session.token}` },
        },
      );

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not own this game",
        name: "ForbiddenError",
        action: "Purchase the game to download its files",
        status_code: 403,
      });
    });
  });
});
