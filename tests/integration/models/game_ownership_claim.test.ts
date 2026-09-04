import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import gameOwnershipClaim from "models/game_ownership_claim";
import orchestrator from "tests/orchestrator";
import {
  createClaimDirect,
  createUnclaimedGame,
} from "tests/integration/_helpers/game_ownership_claim";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("models/game_ownership_claim.ts", () => {
  test("allows competing studios but only one approval can win concurrently", async () => {
    const firstOwner = await orchestrator.createUser();
    await orchestrator.activateUser(firstOwner.id);
    const firstStudio = await orchestrator.createStudio(firstOwner.id);
    const secondOwner = await orchestrator.createUser();
    await orchestrator.activateUser(secondOwner.id);
    const secondStudio = await orchestrator.createStudio(secondOwner.id);
    const game = await createUnclaimedGame("Concurrent Ownership Fixture");
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
    const firstAdmin = await orchestrator.createAdminUser();
    const secondAdmin = await orchestrator.createAdminUser();

    const results = await Promise.allSettled([
      gameOwnershipClaim.decide({
        claimId: firstClaim.id,
        adminUserId: firstAdmin.id,
        decision: "APPROVED",
      }),
      gameOwnershipClaim.decide({
        claimId: secondClaim.id,
        adminUserId: secondAdmin.id,
        decision: "APPROVED",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const rejectedResult = results.find(
      (result) => result.status === "rejected",
    );
    expect(rejectedResult).toMatchObject({
      reason: expect.any(ValidationError),
    });

    const claims = await prisma.gameOwnershipClaim.findMany({
      where: { game_id: game.id },
    });
    expect(claims.filter((claim) => claim.status === "APPROVED")).toHaveLength(
      1,
    );
    expect(claims.filter((claim) => claim.status === "REJECTED")).toHaveLength(
      1,
    );
    expect(claims.filter((claim) => claim.status === "PENDING")).toHaveLength(
      0,
    );

    const winner = claims.find((claim) => claim.status === "APPROVED");
    expect(
      await prisma.game.findUniqueOrThrow({ where: { id: game.id } }),
    ).toMatchObject({
      studio_id: winner?.studio_id,
      status: "ONLY_DISPLAY",
    });
  });

  test("rejects a claim when the game is already owned", async () => {
    const existingOwner = await orchestrator.createUser();
    await orchestrator.activateUser(existingOwner.id);
    const existingStudio = await orchestrator.createStudio(existingOwner.id);
    const game = await orchestrator.createGame(existingOwner.id, {
      studio_id: existingStudio.id,
    });
    await prisma.game.update({
      where: { id: game.id },
      data: { status: "ONLY_DISPLAY" },
    });
    const claimant = await orchestrator.createUser();
    await orchestrator.activateUser(claimant.id);
    const claimantStudio = await orchestrator.createStudio(claimant.id);
    const terms = gameOwnershipClaim.currentOwnershipRightsTerms("en", {
      gameTitle: game.title,
      studioName: claimantStudio.name,
    });

    await expect(
      gameOwnershipClaim.create({
        gameId: game.id,
        studioId: claimantStudio.id,
        requestedByUserId: claimant.id,
        termsLocale: "en",
        acceptedTermsVersion: terms.version,
        acceptedTermsDigest: terms.digest,
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Only unclaimed catalog games can receive ownership claims.",
    });
  });

  test("prevents one requester from flooding a game through multiple studios", async () => {
    const requester = await orchestrator.createUser();
    await orchestrator.activateUser(requester.id);
    const firstStudio = await orchestrator.createStudio(requester.id, {
      name: "Requester First Studio",
    });
    const secondStudio = await orchestrator.createStudio(requester.id, {
      name: "Requester Second Studio",
    });
    const game = await createUnclaimedGame("Requester Flood Fixture");

    await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: firstStudio.id,
      studioName: firstStudio.name,
      userId: requester.id,
    });

    await expect(
      createClaimDirect({
        gameId: game.id,
        gameTitle: game.title,
        studioId: secondStudio.id,
        studioName: secondStudio.name,
        userId: requester.id,
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message:
        "You or this studio already have a pending ownership claim for the game.",
    });

    await expect(
      prisma.gameOwnershipClaim.count({
        where: {
          game_id: game.id,
          requested_by_user_id: requester.id,
          status: "PENDING",
        },
      }),
    ).resolves.toBe(1);
  });
});
