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

describe("POST /api/v1/stores/[slug]/game-overrides/bulk", () => {
  test("applies a previewed request and safely replays the same operation", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const games = await createPublicGames(fixture.owner.id, 2, "Bulk Apply");
    const gameSlugs = games.map(({ slug }) => slug);
    const preview = await previewBulk(
      fixture.store.slug,
      fixture.sessionToken,
      "SHOW",
      gameSlugs,
      fixture.store.draft_revision,
    );
    const operationId = randomUUID();
    const request: BulkRequest = {
      operation_id: operationId,
      action: "SHOW",
      game_slugs: gameSlugs,
      expected_draft_revision: fixture.store.draft_revision,
      request_fingerprint: preview.request_fingerprint,
    };

    const first = await applyBulk(
      fixture.store.slug,
      fixture.sessionToken,
      request,
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toEqual({
      batch_id: expect.any(String),
      changed_count: 2,
      unchanged_count: 0,
      undo_available: true,
      replayed: false,
      draft_revision: fixture.store.draft_revision + 1,
    });

    const replay = await applyBulk(
      fixture.store.slug,
      fixture.sessionToken,
      request,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({
      ...firstBody,
      replayed: true,
    });
    await expect(
      prisma.storeCurationBatch.count({
        where: { store_id: fixture.store.id, operation_id: operationId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.storeGameOverride.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(2);

    const conflictingPreview = await previewBulk(
      fixture.store.slug,
      fixture.sessionToken,
      "HIDE",
      gameSlugs,
      fixture.store.draft_revision + 1,
    );
    const reused = await applyBulk(fixture.store.slug, fixture.sessionToken, {
      ...request,
      action: "HIDE",
      expected_draft_revision: fixture.store.draft_revision + 1,
      request_fingerprint: conflictingPreview.request_fingerprint,
    });
    expect(reused.status).toBe(409);
    await expect(reused.json()).resolves.toEqual(
      expect.objectContaining({
        message: "This operation id was already used for another request.",
        name: "ConflictError",
        status_code: 409,
      }),
    );
  });

  test("rejects requests that do not match their preview and stale drafts", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const [game] = await createPublicGames(fixture.owner.id, 1, "Bulk Guard");
    const base: BulkRequest = {
      operation_id: randomUUID(),
      action: "SHOW",
      game_slugs: [game.slug],
      expected_draft_revision: fixture.store.draft_revision,
      request_fingerprint: "0".repeat(64),
    };
    const mismatch = await applyBulk(
      fixture.store.slug,
      fixture.sessionToken,
      base,
    );
    expect(mismatch.status).toBe(400);
    await expect(mismatch.json()).resolves.toEqual(
      expect.objectContaining({
        message: "The bulk request does not match its preview.",
        name: "ValidationError",
        status_code: 400,
      }),
    );

    const preview = await previewBulk(
      fixture.store.slug,
      fixture.sessionToken,
      "SHOW",
      [game.slug],
      fixture.store.draft_revision,
    );
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });
    const stale = await applyBulk(fixture.store.slug, fixture.sessionToken, {
      ...base,
      operation_id: randomUUID(),
      request_fingerprint: preview.request_fingerprint,
    });
    expect(stale.status).toBe(409);
    await expect(
      prisma.storeCurationBatch.count({
        where: { store_id: fixture.store.id },
      }),
    ).resolves.toBe(0);
  });

  test("rejects malformed, anonymous and cross-Outlet requests", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "game-overrides/bulk");
    const malformed = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({ action: "SHOW", game_slugs: [] }),
    });
    expect(malformed.status).toBe(400);

    const request = JSON.stringify({
      operation_id: randomUUID(),
      action: "SHOW",
      game_slugs: ["protected-game"],
      expected_draft_revision: fixture.store.draft_revision,
      request_fingerprint: "0".repeat(64),
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
    expect(anonymous.status).toBe(403);
    expect(outsider.status).toBe(403);
  });
});

interface BulkRequest {
  operation_id: string;
  action: "SHOW" | "HIDE" | "PIN_SHOW";
  game_slugs: string[];
  expected_draft_revision: number;
  request_fingerprint: string;
}

async function previewBulk(
  slug: string,
  sessionToken: string,
  action: BulkRequest["action"],
  gameSlugs: string[],
  expectedDraftRevision: number,
) {
  const response = await fetch(
    storeApiUrl(slug, "game-overrides/bulk/preview"),
    {
      method: "POST",
      headers: authenticatedJsonHeaders(sessionToken),
      body: JSON.stringify({
        action,
        game_slugs: gameSlugs,
        expected_draft_revision: expectedDraftRevision,
      }),
    },
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{ request_fingerprint: string }>;
}

function applyBulk(slug: string, sessionToken: string, request: BulkRequest) {
  return fetch(storeApiUrl(slug, "game-overrides/bulk"), {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify(request),
  });
}
