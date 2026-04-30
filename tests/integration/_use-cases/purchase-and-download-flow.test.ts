import { Game, GameFile, User, Session } from "generated/prisma/client";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
  await orchestrator.clearStorage();
});

describe("Use case: Purchase and Download Flow", () => {
  let seller: User;
  let sellerSession: Session;
  let buyerSession: Session;
  let game: Game;
  let foundGame: Game;
  let gameInLibrary: Game;
  let gameFile: GameFile;
  let foundGameFile: GameFile;
  const fileContent = "fake-game-binary-content";

  describe("User A (Seller) registers a game and uploads files", () => {
    test("Register and activate Seller", async () => {
      const sellerData = {
        username: "seller-user",
        email: "seller@manifoldpowered.com",
        password: "seller-password",
      };

      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sellerData),
      });

      expect(response.status).toBe(201);
      seller = await response.json();

      const lastEmail = await orchestrator.getLastEmail();
      const activationId = orchestrator.extractUUID(lastEmail.text);
      await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
        {
          method: "PATCH",
        },
      );

      // Grant developer features
      await orchestrator.addFeaturesToUser(seller.id, [
        "create:game",
        "create:game_file",
      ]);

      const loginResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: sellerData.email,
            password: sellerData.password,
          }),
        },
      );
      sellerSession = await loginResponse.json();
    });

    test("Seller registers a new game", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/items/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sellerSession.token}`,
          },
          body: JSON.stringify({
            slug: "test-game-flow",
            title: "Test Game Flow",
            description: "A game to test the purchase and download flow",
            detailed_description:
              "A game to test the purchase and download flow (detailed)",
            developer_name: "Test Developer",
            price: 10.0,
            launch_date: new Date().toISOString(),
          }),
        },
      );

      expect(response.status).toBe(201);
      const createdGame = await response.json();

      // Activate the game so it's visible in the showcase
      game = await gameModel.makePublic(createdGame.id);
    });

    test("Seller uploads a game file", async () => {
      // 1. Get upload URL
      const uploadUrlResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files/upload-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sellerSession.token}`,
          },
          body: JSON.stringify({
            filename: "game-build.zip",
            content_type: "application/zip",
            size_bytes: Buffer.byteLength(fileContent),
          }),
        },
      );

      expect(uploadUrlResponse.status).toBe(200);
      const { upload_url, object_key } = await uploadUrlResponse.json();

      // 2. Actual Upload to storage
      const uploadToStorageResponse = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: fileContent,
      });

      expect(uploadToStorageResponse.status).toBe(200);

      // 3. Register file in database
      const registerFileResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sellerSession.token}`,
          },
          body: JSON.stringify({
            display_name: "Windows Build v1.0",
            platform: "WINDOWS",
            file_url: object_key,
            size_bytes: Buffer.byteLength(fileContent),
            version: "1.0.0",
          }),
        },
      );

      expect(registerFileResponse.status).toBe(201);
      gameFile = await registerFileResponse.json();
    });
  });

  describe("User B (Buyer) buys and downloads the game", () => {
    test("Register and activate Buyer", async () => {
      const buyerData = {
        username: "buyer-user",
        email: "buyer@manifoldpowered.com",
        password: "buyer-password",
      };

      const response = await fetch(`${webserver.getOrigin()}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buyerData),
      });

      expect(response.status).toBe(201);

      const lastEmail = await orchestrator.getLastEmail();
      const activationId = orchestrator.extractUUID(lastEmail.text);
      await fetch(
        `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
        {
          method: "PATCH",
        },
      );

      const loginResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: buyerData.email,
            password: buyerData.password,
          }),
        },
      );
      buyerSession = await loginResponse.json();
    });

    test("Buyer searches for games", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/games`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.games).toHaveLength(1);
      foundGame = body.games.find((g) => g.slug === game.slug);

      expect(foundGame).not.toBeUndefined();
      expect(foundGame.id).toEqual(game.id);
      expect(foundGame.slug).toEqual(game.slug);
      expect(foundGame.status).toEqual(game.status);
    });

    test("Buyer adds game to library", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${buyerSession.token}`,
        },
        body: JSON.stringify({
          slug: foundGame.slug,
        }),
      });

      expect(response.status).toBe(201);
    });

    test("Buyer checks his library", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
        method: "GET",
        headers: {
          Cookie: `session_id=${buyerSession.token}`,
        },
      });

      const libraryResponseBody = await response.json();

      expect(response.status).toBe(200);

      const libraryItems = libraryResponseBody.games;
      const gamesInLibrary = libraryItems.map((item) => item.game);

      const gameWithDatesAsString = {
        ...game,
        launch_date: game.launch_date.toISOString(),
        created_at: game.created_at.toISOString(),
        updated_at: game.updated_at.toISOString(),
      };
      expect(gamesInLibrary).toContainEqual(gameWithDatesAsString);

      gameInLibrary = gamesInLibrary.find((g) => g.slug === game.slug);
      expect(gameInLibrary).not.toBeUndefined();
    });

    test("Buyer list It's game's files", async () => {
      // 1. Get download URL
      const listFilesFromGameResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/games/${gameInLibrary.slug}/files`,
        {
          method: "GET",
          headers: {
            Cookie: `session_id=${buyerSession.token}`,
          },
        },
      );

      expect(listFilesFromGameResponse.status).toBe(200);

      const listOfFiles = await listFilesFromGameResponse.json();
      expect(listOfFiles).toHaveLength(1);
      foundGameFile = listOfFiles[0];
      expect(foundGameFile).toEqual(gameFile);
    });

    test("Buyer downloads the game file", async () => {
      // 1. Get download URL
      const downloadUrlResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/library/download/${foundGameFile.id}`,
        {
          method: "GET",
          headers: {
            Cookie: `session_id=${buyerSession.token}`,
          },
        },
      );

      expect(downloadUrlResponse.status).toBe(200);
      const { download_url } = await downloadUrlResponse.json();

      // 2. Actual Download and verify content
      const downloadResponse = await fetch(download_url);
      expect(downloadResponse.status).toBe(200);
      const downloadedContent = await downloadResponse.text();
      expect(downloadedContent).toBe(fileContent);
    });
  });
});
