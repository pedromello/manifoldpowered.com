import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/library", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`);

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: read:library",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user (unactivated)", () => {
    test("Should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        headers: {
          Cookie: `session_id=${session.token}`,
        },
      });

      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: read:library",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user (activated)", () => {
    test("Should return 200 and an empty library", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        headers: {
          Cookie: `session_id=${session.token}`,
        },
      });

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(Array.isArray(responseBody.games)).toBe(true);
      expect(responseBody.games.length).toBe(0);
      expect(responseBody.pagination).toEqual({
        total_items: 0,
        total_pages: 0,
        current_page: 1,
        items_per_page: 20,
      });
    });

    test("Should return 200 and a list of games with correct filtering", async () => {
      // 1. Setup: Creator and Game
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      await orchestrator.addFeaturesToUser(creator.id, ["create:game"]);
      const game = await orchestrator.createGame(creator.id, {
        title: "Test Game",
      });

      // 2. Setup: Buyer and Library Item
      const buyer = await orchestrator.createUser({
        username: "buyer",
        email: "buyer@test.com",
      });
      await orchestrator.activateUser(buyer.id);
      const session = await orchestrator.createSession(buyer.id);
      await orchestrator.addToLibrary(buyer.id, game.id);

      // 3. Act
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        headers: {
          Cookie: `session_id=${session.token}`,
        },
      });

      // 4. Assert
      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(Array.isArray(responseBody.games)).toBe(true);
      expect(responseBody.games.length).toBe(1);

      const libraryItem = responseBody.games[0];
      expect(libraryItem).toMatchObject({
        item_id: game.id,
        item_type: "GAME",
      });
      expect(libraryItem.id).toBeDefined();
      expect(libraryItem.acquired_at).toBeDefined();

      // Validate exact filtered game object structure
      expect(libraryItem.game).toEqual({
        id: game.id,
        slug: game.slug,
        title: game.title,
        description: game.description,
        detailed_description: game.detailed_description,
        launch_date: expect.any(String),
        price: game.price,
        developer_name: game.developer_name,
        publisher_name: game.publisher_name,
        tags: game.tags,
        meta_tags: game.meta_tags,
        media: game.media,
        social_links: game.social_links,
        requirements: game.requirements || null,
        user_id: game.user_id,
        status: game.status,
        positive_reviews: game.positive_reviews,
        negative_reviews: game.negative_reviews,
        review_score: game.review_score,
        base_price: game.base_price,
        discount_label: game.discount_label,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });

      expect(responseBody.pagination).toEqual({
        total_items: 1,
        total_pages: 1,
        current_page: 1,
        items_per_page: 20,
      });
    });

    test("Should return correct pagination metadata and items for multiple pages", async () => {
      // 1. Setup: Creator and Games
      const creator = await orchestrator.createUser();
      await orchestrator.activateUser(creator.id);
      await orchestrator.addFeaturesToUser(creator.id, ["create:game"]);

      const game1 = await orchestrator.createGame(creator.id, {
        title: "Game 1",
      });
      const game2 = await orchestrator.createGame(creator.id, {
        title: "Game 2",
      });
      const game3 = await orchestrator.createGame(creator.id, {
        title: "Game 3",
      });

      // 2. Setup: Buyer and Library Items
      const buyer = await orchestrator.createUser({
        username: "buyer-pagination",
        email: "buyer-pagination@test.com",
      });
      await orchestrator.activateUser(buyer.id);
      const session = await orchestrator.createSession(buyer.id);

      // Add games in specific order
      await orchestrator.addToLibrary(buyer.id, game1.id);
      await orchestrator.addToLibrary(buyer.id, game2.id);
      await orchestrator.addToLibrary(buyer.id, game3.id);

      // 3. Act: Page 1 with limit 2
      const responsePage1 = await fetch(
        `${webserver.getOrigin()}/api/v1/library?page=1&limit=2`,
        {
          headers: { Cookie: `session_id=${session.token}` },
        },
      );

      expect(responsePage1.status).toBe(200);
      const body1 = await responsePage1.json();
      expect(body1.games.length).toBe(2);
      expect(body1.pagination).toEqual({
        total_items: 3,
        total_pages: 2,
        current_page: 1,
        items_per_page: 2,
      });
      // Should be Game 3 and Game 2 (descending order of acquired_at)
      expect(body1.games[0].item_id).toBe(game3.id);
      expect(body1.games[1].item_id).toBe(game2.id);

      // 4. Act: Page 2 with limit 2
      const responsePage2 = await fetch(
        `${webserver.getOrigin()}/api/v1/library?page=2&limit=2`,
        {
          headers: { Cookie: `session_id=${session.token}` },
        },
      );

      expect(responsePage2.status).toBe(200);
      const body2 = await responsePage2.json();
      expect(body2.games.length).toBe(1);
      expect(body2.pagination).toEqual({
        total_items: 3,
        total_pages: 2,
        current_page: 2,
        items_per_page: 2,
      });
      // Should be Game 1
      expect(body2.games[0].item_id).toBe(game1.id);
    });
  });
});
