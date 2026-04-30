import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import { User, Game, GameFile } from "generated/prisma/client";
import libraryModel from "models/library";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/games/[slug]/files", () => {
  let seller: User;
  let buyerWithoutOwnership: User;
  let buyerWithOwnership: User;
  let game: Game;
  let gameFile: GameFile;

  test("Setup environment", async () => {
    // 1. Create Seller and Game
    seller = await orchestrator.createUser();
    await orchestrator.activateUser(seller.id);
    await orchestrator.addFeaturesToUser(seller.id, [
      "create:game",
      "create:game_file",
    ]);

    const sellerSession = await orchestrator.createSession(seller.id);

    game = await orchestrator.createGame(seller.id, {
      title: "Security Test Game",
    });

    // 2. Create File for Game
    const fileResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sellerSession.token}`,
        },
        body: JSON.stringify({
          display_name: "Main Build",
          platform: "WINDOWS",
          file_url: "https://fake-storage.com/file.zip",
          size_bytes: 1024,
          version: "1.0.0",
        }),
      },
    );
    gameFile = await fileResponse.json();

    // 3. Create Buyers
    buyerWithoutOwnership = await orchestrator.createUser();
    await orchestrator.activateUser(buyerWithoutOwnership.id);

    buyerWithOwnership = await orchestrator.createUser();
    await orchestrator.activateUser(buyerWithOwnership.id);

    // 4. Add to library for buyerWithOwnership
    await libraryModel.add(buyerWithOwnership.id, game.id);
  });

  test("Anonymous user should be forbidden", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
    );
    expect(response.status).toBe(403);
  });

  test("Buyer WITHOUT ownership should be forbidden", async () => {
    const session = await orchestrator.createSession(buyerWithoutOwnership.id);
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
      {
        headers: {
          Cookie: `session_id=${session.token}`,
        },
      },
    );
    expect(response.status).toBe(403);
  });

  test("Buyer WITH ownership should be allowed", async () => {
    const session = await orchestrator.createSession(buyerWithOwnership.id);
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
      {
        headers: {
          Cookie: `session_id=${session.token}`,
        },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(gameFile.id);
  });

  test("Developer (Owner) should be allowed", async () => {
    const session = await orchestrator.createSession(seller.id);
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
      {
        headers: {
          Cookie: `session_id=${session.token}`,
        },
      },
    );

    expect(response.status).toBe(200);
  });
});
