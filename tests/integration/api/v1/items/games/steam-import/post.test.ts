import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

// Note: infra/steam.ts's ServiceError path (network failure/timeout/non-2xx
// from Steam) is intentionally not covered here — it cannot be
// deterministically triggered against the real Steam API without HTTP
// mocking, which this repo does not use. Accepted gap.

const STEAM_TEST_APP_ID = process.env.STEAM_TEST_APP_ID as string;

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/items/games/steam-import", () => {
  describe("Authenticated user", () => {
    test("With 'create:game' feature and studio ownership should return 201 Created", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            studio_id: studio.id,
            steam_app_id: STEAM_TEST_APP_ID,
          }),
        },
      );

      // Assert
      const responseBody = await response.json();

      if (response.status !== 201) {
        console.log("Response Status:", response.status);
        console.log("Response Body:", responseBody);
      }

      expect(response.status).toBe(201);
      expect(responseBody.status).toBe("ACTIVE"); // Moderation is bypassed
      expect(responseBody.steam_app_id).toBe(STEAM_TEST_APP_ID);
      expect(responseBody.studio_id).toBe(studio.id);
      expect(responseBody.social_links.steam_page).toBe(
        `https://store.steampowered.com/app/${STEAM_TEST_APP_ID}/`,
      );
      expect(responseBody.media.videos).toEqual([]);
      expect(Number(responseBody.price)).toBeGreaterThan(0);
      expect(typeof responseBody.title).toBe("string");
      expect(responseBody.title.length).toBeGreaterThan(0);

      const persistedGame = await orchestrator.getGameBySlug(responseBody.slug);
      expect(persistedGame).toBeDefined();
      expect(persistedGame.status).toBe("ACTIVE");
      expect(persistedGame.steam_app_id).toBe(STEAM_TEST_APP_ID);
      expect(persistedGame.studio_id).toBe(studio.id);
      expect(persistedGame.developer_name).toBe(studio.name);
      expect(persistedGame.base_price).toBe(persistedGame.price);
    });

    test("Without membership in the target studio should return 403 Forbidden", async () => {
      // Arrange
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const studio = await orchestrator.createStudio(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      await orchestrator.addFeaturesToUser(outsider.id, ["create:game"]);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({
            studio_id: studio.id,
            steam_app_id: STEAM_TEST_APP_ID,
          }),
        },
      );

      // Assert
      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to create games for this studio",
        action:
          "Verify if you are a member of this studio with game creation rights",
        status_code: 403,
      });
    });

    test("With an invalid steam_app_id format should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            studio_id: studio.id,
            steam_app_id: "not-a-number",
          }),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });

    test("With a nonexistent Steam app should return 404 Not Found", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);
      const nonexistentAppId = "999999999";

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            studio_id: studio.id,
            steam_app_id: nonexistentAppId,
          }),
        },
      );

      // Assert
      expect(response.status).toBe(404);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "NotFoundError",
        message: `Steam app with id "${nonexistentAppId}" was not found or is not available.`,
        action: "Check the Steam app id or store link and try again.",
        status_code: 404,
      });
    });

    test("Re-importing the same Steam app should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const firstResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            studio_id: studio.id,
            steam_app_id: STEAM_TEST_APP_ID,
          }),
        },
      );
      expect(firstResponse.status).toBe(201);
      const firstResponseBody = await firstResponse.json();

      // Act
      const secondResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            studio_id: studio.id,
            steam_app_id: STEAM_TEST_APP_ID,
          }),
        },
      );

      // Assert
      expect(secondResponse.status).toBe(400);
      const secondResponseBody = await secondResponse.json();
      expect(secondResponseBody).toEqual({
        name: "ValidationError",
        message: `Steam app "${STEAM_TEST_APP_ID}" has already been imported as "${firstResponseBody.title}".`,
        action:
          "Check if this game was already imported, or import a different Steam app.",
        status_code: 400,
      });
    });
  });

  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ steam_app_id: STEAM_TEST_APP_ID }),
        },
      );

      // Assert
      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: create:game",
        status_code: 403,
      });
    });
  });
});
