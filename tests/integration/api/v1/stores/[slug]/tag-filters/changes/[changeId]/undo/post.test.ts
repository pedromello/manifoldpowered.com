import { randomUUID } from "node:crypto";

import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createCurationFixture,
  createOutsiderSession,
  storeApiUrl,
} from "tests/integration/api/v1/_support/store-curation";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/stores/[slug]/tag-filters/changes/[changeId]/undo", () => {
  test("restores the prior rule and safely replays the undo", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const change = await createTagChange(
      fixture.store.slug,
      fixture.sessionToken,
      fixture.store.draft_revision,
    );
    const url = storeApiUrl(
      fixture.store.slug,
      `tag-filters/changes/${change.change_id}/undo`,
    );

    const first = await undoTagChange(
      url,
      fixture.sessionToken,
      change.draft_revision,
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      already_undone: false,
      draft_revision: change.draft_revision + 1,
    });
    await expect(
      prisma.storeTagFilter.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.storeTagRuleChange.findUniqueOrThrow({
        where: { id: change.change_id },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ undone_at: expect.any(Date) }),
    );

    const replay = await undoTagChange(
      url,
      fixture.sessionToken,
      change.draft_revision,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({
      already_undone: true,
      draft_revision: change.draft_revision + 1,
    });
  });

  test("rejects stale undo attempts without removing the applied rule", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const change = await createTagChange(
      fixture.store.slug,
      fixture.sessionToken,
      fixture.store.draft_revision,
    );
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });

    const response = await undoTagChange(
      storeApiUrl(
        fixture.store.slug,
        `tag-filters/changes/${change.change_id}/undo`,
      ),
      fixture.sessionToken,
      change.draft_revision,
    );

    expect(response.status).toBe(409);
    await expect(
      prisma.storeTagFilter.findUnique({
        where: {
          store_id_tag: { store_id: fixture.store.id, tag: "rpg" },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ mode: "WHITELIST" }));
  });

  test("validates input and rejects anonymous or unrelated users", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(
      fixture.store.slug,
      `tag-filters/changes/${randomUUID()}/undo`,
    );
    const malformed = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({}),
    });
    const body = JSON.stringify({
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

    expect(malformed.status).toBe(400);
    expect(anonymous.status).toBe(403);
    expect(outsider.status).toBe(403);
  });
});

async function createTagChange(
  slug: string,
  sessionToken: string,
  expectedDraftRevision: number,
) {
  const response = await fetch(storeApiUrl(slug, "tag-filters/changes"), {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify({
      action: "UPSERT",
      tag: "rpg",
      mode: "WHITELIST",
      expected_draft_revision: expectedDraftRevision,
    }),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    change_id: string;
    draft_revision: number;
  }>;
}

function undoTagChange(
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
