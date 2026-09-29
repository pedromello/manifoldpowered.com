import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createCurationFixture,
  createOutsiderSession,
  createPublicGames,
  storeApiUrl,
} from "tests/integration/api/v1/_support/store-curation";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/stores/[slug]/game-overrides/bulk/preview", () => {
  test("returns exact impact and a fingerprint without mutating the draft", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const [game] = await createPublicGames(fixture.owner.id, 1, "Bulk Preview");
    const response = await fetch(
      storeApiUrl(fixture.store.slug, "game-overrides/bulk/preview"),
      {
        method: "POST",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          action: "SHOW",
          game_slugs: [game.slug],
          expected_draft_revision: fixture.store.draft_revision,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      draft_revision: fixture.store.draft_revision,
      request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      changed_count: 1,
      unchanged_count: 0,
    });
    await expect(
      prisma.storeGameOverride.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);
  });

  test("rejects malformed and stale previews", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const malformed = await fetch(
      storeApiUrl(fixture.store.slug, "game-overrides/bulk/preview"),
      {
        method: "POST",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({ action: "SHOW", game_slugs: [] }),
      },
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual(
      expect.objectContaining({
        name: "ValidationError",
        status_code: 400,
        context: expect.any(Array),
      }),
    );

    const [game] = await createPublicGames(fixture.owner.id, 1, "Stale Bulk");
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });
    const stale = await fetch(
      storeApiUrl(fixture.store.slug, "game-overrides/bulk/preview"),
      {
        method: "POST",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          action: "SHOW",
          game_slugs: [game.slug],
          expected_draft_revision: fixture.store.draft_revision,
        }),
      },
    );
    expect(stale.status).toBe(409);
  });

  test("rejects anonymous and cross-Outlet requests", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const outsiderSession = await createOutsiderSession();
    const [game] = await createPublicGames(
      fixture.owner.id,
      1,
      "Protected Bulk",
    );
    const url = storeApiUrl(fixture.store.slug, "game-overrides/bulk/preview");
    const body = JSON.stringify({
      action: "SHOW",
      game_slugs: [game.slug],
      expected_draft_revision: fixture.store.draft_revision,
    });

    const anonymous = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const outsider = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(outsiderSession.token),
      body,
    });

    expect(anonymous.status).toBe(403);
    expect(outsider.status).toBe(403);
  });
});
