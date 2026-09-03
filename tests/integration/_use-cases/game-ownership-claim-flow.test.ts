import { prisma } from "infra/database";
import gameOwnershipClaim from "models/game_ownership_claim";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import {
  createClaimDirect,
  createUnclaimedGame,
} from "tests/integration/_helpers/game_ownership_claim";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("Use case: community game ownership claim", () => {
  test("winner can upload while loser cannot and the game remains unavailable for sale", async () => {
    const winner = await orchestrator.createUser();
    await orchestrator.activateUser(winner.id);
    const winnerStudio = await orchestrator.createStudio(winner.id);
    const winnerSession = await orchestrator.createSession(winner.id);
    const loser = await orchestrator.createUser();
    await orchestrator.activateUser(loser.id);
    const loserStudio = await orchestrator.createStudio(loser.id);
    const loserSession = await orchestrator.createSession(loser.id);
    const game = await createUnclaimedGame("Claim Upload Fixture");
    const winnerClaim = await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: winnerStudio.id,
      studioName: winnerStudio.name,
      userId: winner.id,
    });
    await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: loserStudio.id,
      studioName: loserStudio.name,
      userId: loser.id,
    });
    const admin = await orchestrator.createAdminUser();

    await gameOwnershipClaim.decide({
      claimId: winnerClaim.id,
      adminUserId: admin.id,
      decision: "APPROVED",
    });

    const filePayload = {
      display_name: "Windows build",
      platform: "WINDOWS",
      file_url: `games/${game.id}/files/game.exe`,
      size_bytes: 1024,
      version: "1.0.0",
    };
    const winnerUpload = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
      {
        method: "POST",
        headers: {
          Cookie: `session_id=${winnerSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(filePayload),
      },
    );
    expect(winnerUpload.status).toBe(201);

    const loserUpload = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/files`,
      {
        method: "POST",
        headers: {
          Cookie: `session_id=${loserSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...filePayload, version: "malicious" }),
      },
    );
    expect(loserUpload.status).toBe(403);

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/items/games/${game.slug}`,
    );
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.json()).toMatchObject({
      studio_id: winnerStudio.id,
      ownership_status: "CLAIMED",
      status: "ONLY_DISPLAY",
      price: null,
      purchase_mode: "UNAVAILABLE",
    });
    expect(await prisma.gameFile.count({ where: { game_id: game.id } })).toBe(
      1,
    );
  });

  test("public catalog ownership_status filter returns only matching games", async () => {
    const unclaimed = await createUnclaimedGame("Filter Unclaimed Fixture");
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const claimed = await createUnclaimedGame("Filter Claimed Fixture");
    await prisma.game.update({
      where: { id: claimed.id },
      data: { studio_id: studio.id },
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games?ownership_status=UNCLAIMED&q=Filter`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.games.map((item: { id: string }) => item.id)).toContain(
      unclaimed.id,
    );
    expect(body.games.map((item: { id: string }) => item.id)).not.toContain(
      claimed.id,
    );
  });
});
