import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";
import userModel from "models/user";
import {
  createClaimDirect,
  createUnclaimedGame,
} from "tests/integration/_helpers/game_ownership_claim";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/games/[slug]/ownership-claims", () => {
  test("returns only claims for the selected studio and the exact current terms", async () => {
    const firstOwner = await orchestrator.createUser();
    await orchestrator.activateUser(firstOwner.id);
    const firstStudio = await orchestrator.createStudio(firstOwner.id, {
      name: "Visible Claim Studio",
    });
    const firstSession = await orchestrator.createSession(firstOwner.id);

    const secondOwner = await orchestrator.createUser();
    await orchestrator.activateUser(secondOwner.id);
    const secondStudio = await orchestrator.createStudio(secondOwner.id, {
      name: "Competing Secret Studio",
    });
    const game = await createUnclaimedGame("Isolated Claims Game");

    const firstClaim = await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: firstStudio.id,
      studioName: firstStudio.name,
      userId: firstOwner.id,
    });
    await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: secondStudio.id,
      studioName: secondStudio.name,
      userId: secondOwner.id,
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims?studio_id=${firstStudio.id}&locale=en`,
      { headers: { Cookie: `session_id=${firstSession.token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]).toMatchObject({
      id: firstClaim.id,
      studio: { id: firstStudio.id },
      requested_by: { id: firstOwner.id },
    });
    expect(JSON.stringify(body)).not.toContain(secondStudio.id);
    expect(JSON.stringify(body)).not.toContain(secondOwner.id);
    expect(body.current_terms).toMatchObject({
      version: expect.any(String),
      text: expect.stringContaining(firstStudio.name),
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  test("prevents IDOR against a studio the caller does not represent", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const game = await createUnclaimedGame();

    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    await orchestrator.addFeaturesToUser(outsider.id, [
      "read:game_ownership_claim",
    ]);
    const session = await orchestrator.createSession(outsider.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims?studio_id=${studio.id}&locale=en`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(
      "You cannot access ownership claims for this studio.",
    );
  });

  test("lets a create-only member retrieve terms without exposing claim history", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id, {
      name: "Create Only Studio",
    });
    const game = await createUnclaimedGame("Create Only Terms Game");
    await createClaimDirect({
      gameId: game.id,
      gameTitle: game.title,
      studioId: studio.id,
      studioName: studio.name,
      userId: owner.id,
    });

    const member = await orchestrator.createUser();
    await orchestrator.activateUser(member.id);
    await orchestrator.addStudioMember(studio.id, member.username, [
      "create:game_ownership_claim",
    ]);
    const session = await orchestrator.createSession(member.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims?studio_id=${studio.id}&locale=en`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.claims).toEqual([]);
    expect(body.current_terms).toMatchObject({
      text: expect.stringContaining(studio.name),
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const membership = await prisma.studioMember.findUniqueOrThrow({
      where: {
        studio_id_user_id: { studio_id: studio.id, user_id: member.id },
      },
    });
    expect(membership.permissions).not.toContain("read:game_ownership_claim");
  });

  test("revokes claim access when an existing session belongs to a disabled user", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const game = await createUnclaimedGame("Disabled Claim Reader Game");
    const session = await orchestrator.createSession(owner.id);
    await userModel.disable(owner.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims?studio_id=${studio.id}&locale=en`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(
      "You cannot access ownership claims for this studio.",
    );
  });
});
