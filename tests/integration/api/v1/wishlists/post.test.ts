import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/wishlists", () => {
  describe("Anonymous user", () => {
    test("With anonymous user should return 403", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: "some-game-slug" }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:wishlist",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test.each(["steam", "nintendo"] as const)(
      "can save, read and remove a %s game in the platform wishlist",
      async (provider) => {
        const user = await orchestrator.createUser();
        await orchestrator.activateUser(user.id);
        const session = await orchestrator.createSession(user.id);
        const created = await orchestrator.createGame(user.id, { price: 0 });
        const game = await prisma.game.update({
          where: { id: created.id },
          data: {
            status: "ONLY_DISPLAY",
            studio_id: null,
            publisher_id: null,
            ...(provider === "steam"
              ? {
                  steam_app_id: "901234",
                  social_links: {
                    steam_page: "https://store.steampowered.com/app/901234/",
                  },
                }
              : { nintendo_nsuid: "70010000000001" }),
          },
        });
        const endpoint = `${webserver.getOrigin()}/api/v1/wishlists`;
        const headers = {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        };
        const body = JSON.stringify({ slug: game.slug });
        const statusUrl = `${endpoint}?slug=${encodeURIComponent(game.slug)}`;

        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body,
          });
          expect(response.status).toBe(201);
          expect(await response.json()).toEqual({
            message: "Game added to wishlist",
          });
        }
        const saved = await fetch(statusUrl, { headers });
        expect(saved.status).toBe(200);
        expect(await saved.json()).toEqual({ count: 1, is_wishlisted: true });
        expect(await (await fetch(statusUrl)).json()).toEqual({
          count: 1,
          is_wishlisted: false,
        });
        expect(
          await prisma.productEvent.count({
            where: {
              name: "game_wishlisted",
              user_id: user.id,
              game_id: game.id,
            },
          }),
        ).toBe(1);

        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await fetch(endpoint, {
            method: "DELETE",
            headers,
            body,
          });
          expect(response.status).toBe(200);
        }
        const removed = await fetch(statusUrl, { headers });
        expect(removed.status).toBe(200);
        expect(await removed.json()).toEqual({
          count: 0,
          is_wishlisted: false,
        });
        expect(
          await prisma.wishlistItem.count({
            where: { user_id: user.id, game_id: game.id },
          }),
        ).toBe(0);
        expect(
          await prisma.productEvent.count({
            where: {
              name: "game_unwishlisted",
              user_id: user.id,
              game_id: game.id,
            },
          }),
        ).toBe(1);
      },
    );

    test("With valid slug should add to wishlist and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ slug: game.slug }),
        },
      );

      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.message).toBe("Game added to wishlist");

      const wishlistItem = await prisma.wishlistItem.findUnique({
        where: {
          user_id_game_id: {
            user_id: user.id,
            game_id: game.id,
          },
        },
      });

      expect(wishlistItem).toBeDefined();
    });

    test("With invalid body should return 400", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(400);
      const responseBody = await response.json();

      expect(responseBody.message).toBe("Request body validation failed.");
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.action).toBe(
        "Provide the 'slug' in the request body.",
      );
      expect(responseBody.status_code).toBe(400);
    });

    test("With game already wishlisted should remain idempotent and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);

      // First request
      await fetch(`${webserver.getOrigin()}/api/v1/wishlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ slug: game.slug }),
      });

      // Second request
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/wishlists`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ slug: game.slug }),
        },
      );

      expect(response.status).toBe(201);

      const wishlistItems = await prisma.wishlistItem.findMany({
        where: {
          user_id: user.id,
          game_id: game.id,
        },
      });

      // Ensure only 1 record exists
      expect(wishlistItems.length).toBe(1);
    });
  });
});
