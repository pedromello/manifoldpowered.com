import { prisma } from "infra/database";
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

describe("PATCH /api/v1/backoffice/ownership-claims/[claim_id]", () => {
  test("approves one studio atomically and rejects every competing pending claim", async () => {
    const firstOwner = await orchestrator.createUser();
    await orchestrator.activateUser(firstOwner.id);
    const firstStudio = await orchestrator.createStudio(firstOwner.id);
    const secondOwner = await orchestrator.createUser();
    await orchestrator.activateUser(secondOwner.id);
    const secondStudio = await orchestrator.createStudio(secondOwner.id);
    const game = await createUnclaimedGame("Admin Decision Fixture");
    const firstClaim = await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: firstStudio.id,
      studioName: firstStudio.name,
      userId: firstOwner.id,
    });
    const secondClaim = await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: secondStudio.id,
      studioName: secondStudio.name,
      userId: secondOwner.id,
    });
    const admin = await orchestrator.createAdminUser();
    const adminSession = await orchestrator.createSession(admin.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/backoffice/ownership-claims/${secondClaim.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${adminSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "APPROVED",
          reason: "Evidence matches the publisher records.",
        }),
      },
    );

    expect(response.status).toBe(200);
    const persistedGame = await prisma.game.findUniqueOrThrow({
      where: { id: game.id },
    });
    expect(persistedGame).toMatchObject({
      studio_id: secondStudio.id,
      status: "ONLY_DISPLAY",
    });
    const claims = await prisma.gameOwnershipClaim.findMany({
      where: { game_id: game.id },
    });
    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: secondClaim.id, status: "APPROVED" }),
        expect.objectContaining({ id: firstClaim.id, status: "REJECTED" }),
      ]),
    );
    const log = await prisma.adminActionLog.findFirstOrThrow({
      where: {
        action: "game_ownership_claim:approve",
        target_id: secondClaim.id,
      },
    });
    expect(log.metadata).toMatchObject({
      game_id: game.id,
      studio_id: secondStudio.id,
      auto_rejected_claim_ids: [firstClaim.id],
    });
  });

  test("requires a reason to reject and does not assign the game", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const game = await createUnclaimedGame();
    const claim = await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: studio.id,
      studioName: studio.name,
      userId: owner.id,
    });
    const admin = await orchestrator.createAdminUser();
    const session = await orchestrator.createSession(admin.id);
    const endpoint = `${webserver.getOrigin()}/api/v1/backoffice/ownership-claims/${claim.id}`;

    const withoutReason = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Cookie: `session_id=${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "REJECTED" }),
    });
    expect(withoutReason.status).toBe(400);

    const rejected = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Cookie: `session_id=${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "REJECTED",
        reason: "The submitted evidence is insufficient.",
      }),
    });
    expect(rejected.status).toBe(200);
    expect(
      await prisma.game.findUniqueOrThrow({ where: { id: game.id } }),
    ).toMatchObject({
      studio_id: null,
      status: "ONLY_DISPLAY",
    });
  });

  test("does not allow a non-admin to decide a claim", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const game = await createUnclaimedGame();
    const claim = await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: studio.id,
      studioName: studio.name,
      userId: owner.id,
    });
    const session = await orchestrator.createSession(owner.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/backoffice/ownership-claims/${claim.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision: "APPROVED" }),
      },
    );

    expect(response.status).toBe(403);
    expect(
      await prisma.gameOwnershipClaim.findUniqueOrThrow({
        where: { id: claim.id },
      }),
    ).toMatchObject({ status: "PENDING" });
  });
});
