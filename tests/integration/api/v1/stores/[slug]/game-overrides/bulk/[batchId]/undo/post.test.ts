import { randomUUID } from "node:crypto";

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

describe("POST /api/v1/stores/[slug]/game-overrides/bulk/[batchId]/undo", () => {
  test("undoes a bulk change and safely replays the undo", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const [game] = await createPublicGames(fixture.owner.id, 1, "Bulk Undo");
    const batch = await createBulkBatch(
      fixture.store.slug,
      fixture.sessionToken,
      game.slug,
      fixture.store.draft_revision,
    );
    const url = storeApiUrl(
      fixture.store.slug,
      `game-overrides/bulk/${batch.batch_id}/undo`,
    );

    const first = await undoBulk(
      url,
      fixture.sessionToken,
      batch.draft_revision,
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      batch_id: batch.batch_id,
      undone_count: 1,
      already_undone: false,
      draft_revision: batch.draft_revision + 1,
    });
    await expect(
      prisma.storeGameOverride.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);

    const replay = await undoBulk(
      url,
      fixture.sessionToken,
      batch.draft_revision,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({
      batch_id: batch.batch_id,
      undone_count: 0,
      already_undone: true,
      draft_revision: batch.draft_revision + 1,
    });
  });

  test("rejects stale revisions without reverting the batch", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const [game] = await createPublicGames(fixture.owner.id, 1, "Stale Undo");
    const batch = await createBulkBatch(
      fixture.store.slug,
      fixture.sessionToken,
      game.slug,
      fixture.store.draft_revision,
    );
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });

    const response = await undoBulk(
      storeApiUrl(
        fixture.store.slug,
        `game-overrides/bulk/${batch.batch_id}/undo`,
      ),
      fixture.sessionToken,
      batch.draft_revision,
    );
    expect(response.status).toBe(409);
    expect(
      await prisma.storeGameOverride.findFirst({
        where: { store_id: fixture.store.id, game_id: game.id },
      }),
    ).toEqual(expect.objectContaining({ visibility: "SHOW" }));
  });

  test("validates input and rejects anonymous or unrelated users", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(
      fixture.store.slug,
      `game-overrides/bulk/${randomUUID()}/undo`,
    );
    const malformed = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({}),
    });
    const request = JSON.stringify({
      expected_draft_revision: fixture.store.draft_revision,
    });
    const anonymous = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: request,
    });
    const outsider = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(outsiderSession.token),
      body: request,
    });

    expect(malformed.status).toBe(400);
    expect(anonymous.status).toBe(403);
    expect(outsider.status).toBe(403);
  });
});

async function createBulkBatch(
  slug: string,
  sessionToken: string,
  gameSlug: string,
  expectedDraftRevision: number,
) {
  const previewResponse = await fetch(
    storeApiUrl(slug, "game-overrides/bulk/preview"),
    {
      method: "POST",
      headers: authenticatedJsonHeaders(sessionToken),
      body: JSON.stringify({
        action: "SHOW",
        game_slugs: [gameSlug],
        expected_draft_revision: expectedDraftRevision,
      }),
    },
  );
  expect(previewResponse.status).toBe(200);
  const preview = (await previewResponse.json()) as {
    request_fingerprint: string;
  };
  const applyResponse = await fetch(storeApiUrl(slug, "game-overrides/bulk"), {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify({
      operation_id: randomUUID(),
      action: "SHOW",
      game_slugs: [gameSlug],
      expected_draft_revision: expectedDraftRevision,
      request_fingerprint: preview.request_fingerprint,
    }),
  });
  expect(applyResponse.status).toBe(200);
  return applyResponse.json() as Promise<{
    batch_id: string;
    draft_revision: number;
  }>;
}

function undoBulk(
  url: string,
  sessionToken: string,
  expectedDraftRevision: number,
) {
  return fetch(url, {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify({
      expected_draft_revision: expectedDraftRevision,
    }),
  });
}
