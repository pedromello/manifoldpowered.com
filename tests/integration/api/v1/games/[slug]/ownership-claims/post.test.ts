import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameOwnershipClaim from "models/game_ownership_claim";
import {
  createClaimThroughApi,
  createUnclaimedGame,
  getCurrentTerms,
} from "tests/integration/_helpers/game_ownership_claim";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/games/[slug]/ownership-claims", () => {
  test("stores the exact displayed rights declaration after explicit acceptance", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id, {
      name: "Attested Studio",
    });
    const session = await orchestrator.createSession(owner.id);
    const game = await createUnclaimedGame("Attested Catalog Game");
    const terms = await getCurrentTerms({
      slug: game.slug,
      studioId: studio.id,
      sessionToken: session.token,
      locale: "pt-BR",
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims`,
      {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studio_id: studio.id,
          accepted_rights_terms: true,
          terms_locale: "pt-BR",
          terms_version: terms.version,
          terms_digest: terms.digest,
        }),
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.claim).toMatchObject({
      status: "PENDING",
      game: { id: game.id, slug: game.slug },
      studio: { id: studio.id },
      requested_by: { id: owner.id },
      terms: {
        version: terms.version,
        locale: "pt-BR",
        text: terms.text,
        accepted_at: expect.any(String),
      },
    });

    const persisted = await prisma.gameOwnershipClaim.findUniqueOrThrow({
      where: { id: body.claim.id },
    });
    expect(persisted.rights_attestation_text).toBe(terms.text);
    expect(persisted.rights_attestation_version).toBe(terms.version);
    expect(persisted.requested_by_user_id).toBe(owner.id);
  });

  test("rejects missing acceptance and a stale terms digest", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const game = await createUnclaimedGame();
    const terms = await getCurrentTerms({
      slug: game.slug,
      studioId: studio.id,
      sessionToken: session.token,
    });
    const endpoint = `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims`;

    const withoutAcceptance = await fetch(endpoint, {
      method: "POST",
      headers: {
        Cookie: `session_id=${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studio_id: studio.id,
        terms_locale: "en",
        terms_version: terms.version,
        terms_digest: terms.digest,
      }),
    });
    expect(withoutAcceptance.status).toBe(400);

    const staleDigest = await fetch(endpoint, {
      method: "POST",
      headers: {
        Cookie: `session_id=${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studio_id: studio.id,
        accepted_rights_terms: true,
        terms_locale: "en",
        terms_version: terms.version,
        terms_digest: "0".repeat(64),
      }),
    });
    expect(staleDigest.status).toBe(400);
    expect((await staleDigest.json()).message).toBe(
      "The ownership rights terms have changed since they were displayed.",
    );
    expect(
      await prisma.gameOwnershipClaim.count({ where: { game_id: game.id } }),
    ).toBe(0);
  });

  test("prevents a user with the global feature from claiming for another studio", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const game = await createUnclaimedGame();

    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    await orchestrator.addFeaturesToUser(outsider.id, [
      "create:game_ownership_claim",
      "read:game_ownership_claim",
    ]);
    const outsiderSession = await orchestrator.createSession(outsider.id);
    const terms = gameOwnershipTermsFor(game.title, studio.name);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/ownership-claims`,
      {
        method: "POST",
        headers: {
          Cookie: `session_id=${outsiderSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studio_id: studio.id,
          accepted_rights_terms: true,
          terms_locale: "en",
          terms_version: terms.version,
          terms_digest: terms.digest,
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(
      await prisma.gameOwnershipClaim.count({ where: { game_id: game.id } }),
    ).toBe(0);
  });

  test("rejects a duplicate pending claim for the same studio and game", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const studio = await orchestrator.createStudio(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const game = await createUnclaimedGame();

    const first = await createClaimThroughApi({
      slug: game.slug,
      studioId: studio.id,
      sessionToken: session.token,
    });
    const duplicate = await createClaimThroughApi({
      slug: game.slug,
      studioId: studio.id,
      sessionToken: session.token,
    });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).message).toBe(
      "This studio already has a pending ownership claim for the game.",
    );
  });
});

function gameOwnershipTermsFor(gameTitle: string, studioName: string) {
  // Deliberately use the model's server-owned template instead of copying it
  // into the test. The assertion here is authorization, not wording.
  return gameOwnershipClaim.currentOwnershipRightsTerms("en", {
    gameTitle,
    studioName,
  });
}
