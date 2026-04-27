import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/items/games/[slug]", () => {
  describe("Anonymous user", () => {
    test("Try to update a game", async () => {
      const user = await orchestrator.createUser();
      const game = await orchestrator.createGame(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "New Title",
          }),
        },
      );

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody.message).toBe(
        "You do not have permission to perform this action",
      );
      expect(responseBody.action).toBe(
        "Verify your user has the following features: update:game",
      );
      expect(responseBody.status_code).toBe(403);
    });
  });

  describe("Authenticated user", () => {
    test("Updating their own game", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["update:game"]);
      const session = await orchestrator.createSession(user.id);

      const game = await orchestrator.createGame(user.id, {
        title: "Original Title",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            title: "New Title",
            description: "Updated description",
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.title).toBe("New Title");
      expect(responseBody.description).toBe("Updated description");
      expect(responseBody.slug).toBe("new-title"); // Should update slug
    });

    test("Updating someone else's game", async () => {
      const owner = await orchestrator.createUser();
      const game = await orchestrator.createGame(owner.id);

      const otherUser = await orchestrator.createUser();
      await orchestrator.activateUser(otherUser.id);
      await orchestrator.addFeaturesToUser(otherUser.id, ["update:game"]);
      const otherSession = await orchestrator.createSession(otherUser.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${otherSession.token}`,
          },
          body: JSON.stringify({
            title: "Hacked Title",
          }),
        },
      );

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody.message).toBe(
        "You do not have permission to update this game",
      );
    });

    test("Deep merging JSON fields (media)", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["update:game"]);
      const session = await orchestrator.createSession(user.id);

      const originalMedia = {
        icon: "https://example.com/icon.png",
        screenshots: ["https://example.com/ss1.png"],
        videos: [],
      };

      const game = await orchestrator.createGame(user.id, {
        media: originalMedia,
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            media: {
              icon: "https://example.com/new-icon.png",
            },
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.media.icon).toBe("https://example.com/new-icon.png");
      expect(responseBody.media.screenshots).toEqual([
        "https://example.com/ss1.png",
      ]); // Should persist
    });
  });

  describe("Admin user", () => {
    test("Updating any game", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.addFeaturesToUser(owner.id, ["create:game"]);
      const game = await orchestrator.createGame(owner.id);

      const admin = await orchestrator.createUser();
      await orchestrator.activateUser(admin.id);
      await orchestrator.addFeaturesToUser(admin.id, [
        "update:game",
        "update:game:any",
      ]);
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${adminSession.token}`,
          },
          body: JSON.stringify({
            title: "Admin Override",
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.title).toBe("Admin Override");
    });
  });

  describe("Protected fields", () => {
    test("Fields that should be ignored or not directly editable", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["update:game"]);
      const session = await orchestrator.createSession(user.id);

      const game = await orchestrator.createGame(user.id, {
        title: "Protected Test",
      });

      const otherUser = await orchestrator.createUser();

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            user_id: otherUser.id,
            positive_reviews: 9999,
            negative_reviews: 9999,
            review_score: "OVERWHELMINGLY_POSITIVE",
            created_at: new Date(0).toISOString(),
            updated_at: new Date(0).toISOString(),
            slug: "manual-slug",
            discount_label: "-99%",
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();

      // Verify that these fields were NOT changed
      expect(responseBody.user_id).toBe(user.id);
      expect(responseBody.positive_reviews).toBe(0);
      expect(responseBody.negative_reviews).toBe(0);
      expect(responseBody.review_score).toBe("MIXED");
      expect(responseBody.slug).toBe(game.slug);
      expect(new Date(responseBody.created_at).getTime()).toBeCloseTo(
        new Date(game.created_at).getTime(),
        -3,
      );
    });

    test("Slug update via title", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["update:game"]);
      const session = await orchestrator.createSession(user.id);

      const game = await orchestrator.createGame(user.id, {
        title: "Old Title",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            title: "Unique New Title",
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.slug).toBe("unique-new-title");
    });

    test("Automatic discount_label calculation", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["update:game"]);
      const session = await orchestrator.createSession(user.id);

      const game = await orchestrator.createGame(user.id, {
        price: 100,
      });

      // Update base_price to create a discount
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            base_price: 200,
          }),
        },
      );

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody.discount_label).toBe("-50%");

      // Set price higher than base_price (discount should be null)
      const response2 = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games/${responseBody.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({
            price: 250,
          }),
        },
      );

      expect(response2.status).toBe(200);
      const responseBody2 = await response2.json();
      expect(responseBody2.discount_label).toBeNull();
    });
  });
});
