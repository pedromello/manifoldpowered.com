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

describe("POST /api/v1/stores/[slug]/curation-catalog/mode", () => {
  test("the owner changes the catalog mode with compare-and-swap persistence", async () => {
    const fixture = await createCurationFixture();

    const response = await fetch(
      storeApiUrl(fixture.store.slug, "curation-catalog/mode"),
      {
        method: "POST",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          catalog_mode: "SELECTED",
          expected_draft_revision: fixture.store.draft_revision,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      catalog_mode: "SELECTED",
      draft_revision: fixture.store.draft_revision + 1,
    });
    await expect(
      prisma.store.findUniqueOrThrow({ where: { id: fixture.store.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        catalog_mode: "SELECTED",
        draft_revision: fixture.store.draft_revision + 1,
      }),
    );
  });

  test("rejects stale revisions without changing the mode", async () => {
    const fixture = await createCurationFixture("ALL");
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });

    const response = await fetch(
      storeApiUrl(fixture.store.slug, "curation-catalog/mode"),
      {
        method: "POST",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          catalog_mode: "SELECTED",
          expected_draft_revision: fixture.store.draft_revision,
        }),
      },
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
    expect(
      (
        await prisma.store.findUniqueOrThrow({
          where: { id: fixture.store.id },
        })
      ).catalog_mode,
    ).toBe("ALL");
  });

  test("validates the complete request body", async () => {
    const fixture = await createCurationFixture();
    const response = await fetch(
      storeApiUrl(fixture.store.slug, "curation-catalog/mode"),
      {
        method: "POST",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({ catalog_mode: "EVERYTHING" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        name: "ValidationError",
        status_code: 400,
        context: expect.any(Array),
      }),
    );
  });

  test("rejects anonymous and unrelated authenticated users", async () => {
    const fixture = await createCurationFixture();
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "curation-catalog/mode");
    const body = JSON.stringify({
      catalog_mode: "ALL",
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
    await expect(outsider.json()).resolves.toEqual(
      expect.objectContaining({ name: "ForbiddenError", status_code: 403 }),
    );
  });
});
