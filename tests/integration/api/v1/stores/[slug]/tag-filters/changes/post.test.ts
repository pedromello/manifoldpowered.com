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

describe("POST /api/v1/stores/[slug]/tag-filters/changes", () => {
  test("records an atomic tag-rule change and makes exact retries no-ops", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const first = await changeTagRule(
      fixture.store.slug,
      fixture.sessionToken,
      {
        action: "UPSERT",
        tag: " RPG ",
        mode: "WHITELIST",
        expected_draft_revision: fixture.store.draft_revision,
      },
    );

    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toEqual({
      change_id: expect.any(String),
      changed: true,
      draft_revision: fixture.store.draft_revision + 1,
    });
    await expect(
      prisma.storeTagFilter.findUnique({
        where: {
          store_id_tag: { store_id: fixture.store.id, tag: "rpg" },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ mode: "WHITELIST" }));
    await expect(
      prisma.storeTagRuleChange.findUnique({
        where: { id: firstBody.change_id },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        store_id: fixture.store.id,
        tag: "rpg",
        previous_mode: null,
        applied_mode: "WHITELIST",
      }),
    );

    const noOp = await changeTagRule(fixture.store.slug, fixture.sessionToken, {
      action: "UPSERT",
      tag: "rpg",
      mode: "WHITELIST",
      expected_draft_revision: fixture.store.draft_revision + 1,
    });
    expect(noOp.status).toBe(200);
    await expect(noOp.json()).resolves.toEqual({
      change_id: null,
      changed: false,
      draft_revision: fixture.store.draft_revision + 1,
    });
    await expect(
      prisma.storeTagRuleChange.count({
        where: { store_id: fixture.store.id },
      }),
    ).resolves.toBe(1);
  });

  test("rejects malformed and stale changes without partial persistence", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const malformed = await changeTagRule(
      fixture.store.slug,
      fixture.sessionToken,
      {
        action: "UPSERT",
        tag: "rpg",
        expected_draft_revision: fixture.store.draft_revision,
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

    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });
    const stale = await changeTagRule(
      fixture.store.slug,
      fixture.sessionToken,
      {
        action: "UPSERT",
        tag: "rpg",
        mode: "WHITELIST",
        expected_draft_revision: fixture.store.draft_revision,
      },
    );
    expect(stale.status).toBe(409);
    await expect(
      prisma.storeTagFilter.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.storeTagRuleChange.count({
        where: { store_id: fixture.store.id },
      }),
    ).resolves.toBe(0);
  });

  test("rejects anonymous and cross-Outlet requests", async () => {
    const fixture = await createCurationFixture("SELECTED");
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "tag-filters/changes");
    const body = JSON.stringify({
      action: "UPSERT",
      tag: "rpg",
      mode: "WHITELIST",
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

function changeTagRule(
  slug: string,
  sessionToken: string,
  body: Record<string, unknown>,
) {
  return fetch(storeApiUrl(slug, "tag-filters/changes"), {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify(body),
  });
}
