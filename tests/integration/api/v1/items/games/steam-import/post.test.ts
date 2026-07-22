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
    test("With 'create:game' feature and studio ownership should return 201 Created; re-importing refreshes it (200) instead of duplicating it; and an unrelated studio cannot hijack it via re-import", async () => {
      // steam_app_id is globally unique, and STEAM_TEST_APP_ID is the only
      // real, deterministic fixture available (per the product owner's
      // explicit choice to hit the real Steam API rather than mock it) — so
      // every scenario that needs an "already imported" game must reuse the
      // same single successful import within one test, rather than each
      // getting their own "first" import across separate tests.

      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      // Act: fresh import.
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

      // Act again: the same studio re-imports the same Steam app.
      const reimportResponse = await fetch(
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

      // Assert: the existing game is refreshed in place, not duplicated.
      expect(reimportResponse.status).toBe(200);
      const reimportResponseBody = await reimportResponse.json();
      expect(reimportResponseBody.id).toBe(responseBody.id);
      expect(reimportResponseBody.slug).toBe(responseBody.slug);
      expect(reimportResponseBody.steam_app_id).toBe(STEAM_TEST_APP_ID);
      expect(reimportResponseBody.status).toBe("ACTIVE");
      // Ownership is untouched by a refresh — still the original studio.
      expect(reimportResponseBody.studio_id).toBe(studio.id);

      const gameAfterRefresh = await orchestrator.getGameBySlug(
        responseBody.slug,
      );
      expect(gameAfterRefresh.id).toBe(responseBody.id);

      // Act again: an unrelated user, with their own unrelated studio and
      // create:game rights there, tries to "re-import" the same Steam app
      // under their own studio_id.
      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      await orchestrator.addFeaturesToUser(outsider.id, ["create:game"]);
      const outsiderSession = await orchestrator.createSession(outsider.id);
      const outsiderStudio = await orchestrator.createStudio(outsider.id);

      const hijackResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/steam-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({
            studio_id: outsiderStudio.id,
            steam_app_id: STEAM_TEST_APP_ID,
          }),
        },
      );

      // Assert: authorized against the game's real studio, not the
      // request's studio_id — the outsider cannot take it over.
      expect(hijackResponse.status).toBe(403);
      const hijackResponseBody = await hijackResponse.json();
      expect(hijackResponseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to update this game",
        action: "Verify if you are the owner of this game",
        status_code: 403,
      });

      const gameAfterHijackAttempt = await orchestrator.getGameBySlug(
        responseBody.slug,
      );
      expect(gameAfterHijackAttempt.studio_id).toBe(studio.id);
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
