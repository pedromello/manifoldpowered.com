import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/items/games", () => {
  describe("Authenticated user", () => {
    test("With 'create:game' feature and valid data should return 201 Created", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id, {
        name: "Hibernian Workshop",
      });

      const gameData = {
        title: "Astral Ascent",
        description: "A fast-paced 2D platformer rogue-lite.",
        detailed_description:
          "Astral Ascent is a 2D platformer rogue-lite set in a modern fantasy world.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: "199.90",
        studio_id: studio.id,
        tags: ["Rogue-lite", "Platformer", "Indie"],
        meta_tags: {
          category: "Action",
          rating: "T",
          languages: ["en", "pt-BR"],
          keywords: ["pixel art", "challenging"],
          platforms: ["windows", "linux"],
        },
        media: {
          banner: "https://example.com/banner.jpg",
          screenshots: [
            "https://example.com/ss1.jpg",
            "https://example.com/ss2.jpg",
          ],
          icon: "https://example.com/icon.jpg",
          videos: ["https://youtube.com/watch?v=123"],
        },
        social_links: {
          website: "https://astral-ascent.com",
          twitter: "https://twitter.com/hibernianws",
        },
        requirements: {
          minimum: {
            os: "Windows 7",
            processor: "Intel Core i3",
            memory: "4 GB RAM",
            graphics: "NVIDIA GeForce GTX 660",
            storage: "2 GB available space",
          },
        },
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      const responseBody = await response.json();

      if (response.status !== 201) {
        console.log("Response Status:", response.status);
        console.log("Response Body:", responseBody);
      }

      expect(response.status).toBe(201);
      expect(responseBody.title).toBe(gameData.title);
      expect(responseBody.slug).toBe("astral-ascent"); // Expected auto-slug
      expect(responseBody.studio_id).toBe(studio.id);
      expect(responseBody.publisher_id).toBe(null);
      expect(responseBody.media).toEqual(gameData.media);
      expect(responseBody.status).toBe("PRIVATE"); // Default status

      const game = await orchestrator.getGameBySlug("astral-ascent");
      expect(game).toBeDefined();
      expect(game.title).toBe(gameData.title);
      expect(game.slug).toBe("astral-ascent");
      expect(game.studio_id).toBe(studio.id);
      expect(game.media).toEqual(gameData.media);
      expect(game.status).toBe("PRIVATE");
      expect(game.developer_name).toBe(studio.name);
      expect(game.publisher_name).toBe(studio.name);
      expect(game.price).toBe(gameData.price);

      expect(game.positive_reviews).toBe(0);
      expect(game.negative_reviews).toBe(0);
      expect(game.base_price).toBe(gameData.price);
    });

    test("Without 'create:game' feature should return 403 Forbidden", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      // No 'create:game' feature added
      const session = await orchestrator.createSession(user.id);

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify({ title: "Unauthorized Game" }),
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

    test("Without membership in the target studio should return 403 Forbidden", async () => {
      // Arrange
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const studio = await orchestrator.createStudio(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      await orchestrator.addFeaturesToUser(outsider.id, ["create:game"]);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const gameData = {
        title: "Trespasser Game",
        description: "Testing studio membership enforcement.",
        detailed_description: "Testing studio membership enforcement.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify(gameData),
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

    test("With a permitted studio member should return 201 Created", async () => {
      // Arrange
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const studio = await orchestrator.createStudio(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addFeaturesToUser(member.id, ["create:game"]);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "create:game",
      ]);

      const gameData = {
        title: "Studio Member Game",
        description: "Testing studio membership enforcement.",
        detailed_description: "Testing studio membership enforcement.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${memberSession.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.studio_id).toBe(studio.id);
    });

    test("With a publisher_id the caller does not have rights to should return 403 Forbidden", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const developerStudio = await orchestrator.createStudio(user.id);

      const otherOwner = await orchestrator.createUser();
      await orchestrator.activateUser(otherOwner.id);
      const publisherStudio = await orchestrator.createStudio(otherOwner.id, {
        is_publisher: true,
      });

      const gameData = {
        title: "Unauthorized Publisher Game",
        description: "Testing publisher consent enforcement.",
        detailed_description: "Testing publisher consent enforcement.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: developerStudio.id,
        publisher_id: publisherStudio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(403);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message:
          "You do not have permission to attribute this game to the given publisher studio",
        action:
          "Verify if you are a member of the publisher studio with game creation rights",
        status_code: 403,
      });
    });

    test("With a publisher_id not marked as a publisher should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const developerStudio = await orchestrator.createStudio(user.id);
      const nonPublisherStudio = await orchestrator.createStudio(user.id, {
        is_publisher: false,
      });

      const gameData = {
        title: "Non Publisher Studio Game",
        description: "Testing is_publisher enforcement.",
        detailed_description: "Testing is_publisher enforcement.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: developerStudio.id,
        publisher_id: nonPublisherStudio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ValidationError",
        message: `Studio "${nonPublisherStudio.name}" is not marked as a publisher.`,
        action:
          "Choose a studio with is_publisher enabled, or omit publisher_id to self-publish.",
        status_code: 400,
      });
    });

    test("With a valid publisher_id the caller has rights to should return 201 Created", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const developerStudio = await orchestrator.createStudio(user.id);
      const publisherStudio = await orchestrator.createStudio(user.id, {
        is_publisher: true,
      });

      const gameData = {
        title: "Published Game",
        description: "Testing publisher assignment.",
        detailed_description: "Testing publisher assignment.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: developerStudio.id,
        publisher_id: publisherStudio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.studio_id).toBe(developerStudio.id);
      expect(responseBody.publisher_id).toBe(publisherStudio.id);

      const game = await orchestrator.getGameBySlug("published-game");
      expect(game.developer_name).toBe(developerStudio.name);
      expect(game.publisher_name).toBe(publisherStudio.name);
    });
  });

  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: "Anonymous Game" }),
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

  describe("Validation", () => {
    test("With missing required fields should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);

      const invalidData = {
        title: "Incomplete Game",
        // Missing description, price, studio_id, etc.
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(invalidData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ValidationError",
        message: "One or more fields are invalid",
        action: "Check the fields and try again",
        status_code: 400,
        context: [
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["description"],
          },
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["detailed_description"],
          },
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["launch_date"],
          },
          {
            code: "invalid_type",
            expected: "number",
            message: "Invalid input: expected number, received NaN",
            path: ["price"],
            received: "NaN",
          },
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["studio_id"],
          },
        ],
      });
    });

    test("With already existing slug should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const game = await orchestrator.createGame(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const gameData = {
        title: game.title,
        description: "A game that already exists",
        detailed_description: "A game that already exists",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: "199.90",
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ValidationError",
        message: `Game with slug ${game.slug} already exists. It's title is ${game.title}.`,
        action: "Try a different title.",
        status_code: 400,
      });
    });

    test("With publisher_id omitted should default to the developer studio", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id, {
        name: "Solo Dev",
      });

      const gameData = {
        title: "Publisher Test Game",
        description: "A game with no publisher specified.",
        detailed_description: "A game with no publisher specified.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 9.99,
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(201);
      const responseBody = await response.json();
      expect(responseBody.publisher_id).toBe(null);
      expect(responseBody.publisher_name).toBe(studio.name);

      const game = await orchestrator.getGameBySlug("publisher-test-game");
      expect(game.publisher_name).toBe(studio.name);
    });

    test("With price sent as number without decimals should be formatted to .00", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const gameData = {
        title: "Price Formatting Test",
        description: "Testing price decimal formatting.",
        detailed_description: "Testing price decimal formatting.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 50,
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(gameData),
        },
      );

      // Assert
      expect(response.status).toBe(201);
      const game = await orchestrator.getGameBySlug("price-formatting-test");
      expect(game.price).toBe("50.00");
      expect(game.base_price).toBe("50.00");
    });

    test("With negative price should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const invalidData = {
        title: "Negative Price Game",
        description: "Testing negative price.",
        detailed_description: "Testing negative price.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: -10,
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(invalidData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.context[0].code).toBe("too_small");
    });

    test("With description longer than 300 characters should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const invalidData = {
        title: "Long Description Game",
        description: "a".repeat(301),
        detailed_description: "Testing long description.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: studio.id,
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(invalidData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.context[0].code).toBe("too_big");
    });

    test("With invalid URL in media should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const invalidData = {
        title: "Invalid URL Game",
        description: "Testing invalid URL.",
        detailed_description: "Testing invalid URL.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: studio.id,
        media: {
          banner: "not-a-url",
        },
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(invalidData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.context[0].code).toBe("invalid_format");
    });

    test("With video url that its not from youtube should return 400 Bad Request", async () => {
      // Arrange
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      await orchestrator.addFeaturesToUser(user.id, ["create:game"]);
      const session = await orchestrator.createSession(user.id);
      const studio = await orchestrator.createStudio(user.id);

      const invalidData = {
        title: "Invalid Video URL Game",
        description: "Testing invalid video URL.",
        detailed_description: "Testing invalid video URL.",
        launch_date: "2023-11-14T00:00:00.000Z",
        price: 19.99,
        studio_id: studio.id,
        media: {
          screenshots: [],
          videos: ["https://vimeo.com/123456789"],
        },
      };

      // Act
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${session.token}`,
          },
          body: JSON.stringify(invalidData),
        },
      );

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ValidationError",
        message:
          "Invalid video URL: https://vimeo.com/123456789. Videos must be a valid URL hosted on YouTube.",
        action: "Check if video URL is valid and from YouTube.",
        status_code: 400,
      });
    });
  });
});
