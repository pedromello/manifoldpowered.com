import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createOutsiderSession,
  expectPrivateResponse,
  storeApiUrl,
} from "tests/integration/api/v1/_support/store-curation";
import {
  createReadyDraft,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/stores/[slug]/publication", () => {
  test("publishes an immutable revision and records the lifecycle event", async () => {
    const fixture = await createReadyDraft("Dedicated Publication Route");

    const response = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      fixture.store.draft_revision,
    );

    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        status: "PUBLISHED",
        draft_revision: fixture.store.draft_revision,
        published_revision: expect.objectContaining({
          revision: 1,
          source_draft_revision: fixture.store.draft_revision,
        }),
        readiness: expect.objectContaining({ version: 2, ready: true }),
        capabilities: expect.objectContaining({
          publish: true,
          unpublish: true,
        }),
      }),
    );
    await expect(
      prisma.storeRevision.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.storeLifecycleEvent.findMany({
        where: { store_id: fixture.store.id },
        select: { action: true, actor_user_id: true },
      }),
    ).resolves.toEqual([{ action: "PUBLISH", actor_user_id: fixture.user.id }]);
  });

  test("rejects stale revisions without creating publication side effects", async () => {
    const fixture = await createReadyDraft("Stale Publication Route");
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });

    const response = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      fixture.store.draft_revision,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        name: "ConflictError",
        status_code: 409,
        context: {
          expected_draft_revision: fixture.store.draft_revision,
          actual_draft_revision: fixture.store.draft_revision + 1,
        },
      }),
    );
    await expect(
      prisma.storeRevision.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.storeLifecycleEvent.count({
        where: { store_id: fixture.store.id },
      }),
    ).resolves.toBe(0);
  });

  test("validates input and enforces resource-scoped publication access", async () => {
    const fixture = await createReadyDraft("Publication Authorization");
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "publication");
    const invalid = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({
        action: "launch",
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });
    const anonymous = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish",
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });
    const outsider = await fetch(url, {
      method: "POST",
      headers: authenticatedJsonHeaders(outsiderSession.token),
      body: JSON.stringify({
        action: "publish",
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual(
      expect.objectContaining({
        message: "One or more fields are invalid",
        name: "ValidationError",
        action: "Choose either publish or unpublish and try again",
        status_code: 400,
        context: expect.any(Array),
      }),
    );
    expect(anonymous.status).toBe(403);
    expect(outsider.status).toBe(403);
    await expect(outsider.json()).resolves.toEqual(
      expect.objectContaining({
        message:
          "You do not have permission to publish or unpublish this Outlet.",
        name: "ForbiddenError",
        status_code: 403,
      }),
    );
  });
});
