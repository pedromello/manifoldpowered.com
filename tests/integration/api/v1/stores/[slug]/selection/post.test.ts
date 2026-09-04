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

describe("POST /api/v1/stores/[slug]/selection", () => {
  test("previews a focused selection without mutating the draft", async () => {
    const fixture = await createCurationFixture();
    await createPublicGames(fixture.owner.id, 5, "Focused Preview", ["RPG"]);

    const response = await fetch(storeApiUrl(fixture.store.slug, "selection"), {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({
        strategy: "FOCUSED",
        tags: [" RPG ", "rpg"],
        game_slugs: [],
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      strategy: "FOCUSED",
      catalog_mode: "SELECTED",
      tags: ["rpg"],
      game_slugs: [],
      catalog_game_count: 5,
      minimum_game_count: 5,
      can_apply: true,
      draft_revision: fixture.store.draft_revision,
    });
    await expect(
      prisma.store.findUniqueOrThrow({ where: { id: fixture.store.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        catalog_mode: "UNDECIDED",
        draft_revision: fixture.store.draft_revision,
      }),
    );
    await expect(
      prisma.storeTagFilter.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);
  });

  test("rejects invalid and stale previews with their exact error contracts", async () => {
    const fixture = await createCurationFixture();
    const invalid = await fetch(storeApiUrl(fixture.store.slug, "selection"), {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: ["only-one"],
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual(
      expect.objectContaining({
        message: "The Outlet selection preview is invalid.",
        name: "ValidationError",
        action: "Choose a focus or at least five games and try again.",
        status_code: 400,
        context: expect.any(Array),
      }),
    );

    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });
    const stale = await fetch(storeApiUrl(fixture.store.slug, "selection"), {
      method: "POST",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({
        strategy: "FOCUSED",
        tags: ["rpg"],
        game_slugs: [],
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual(
      expect.objectContaining({ name: "ConflictError", status_code: 409 }),
    );
  });

  test("rejects anonymous and unrelated authenticated users", async () => {
    const fixture = await createCurationFixture();
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "selection");
    const body = JSON.stringify({
      strategy: "FOCUSED",
      tags: ["rpg"],
      game_slugs: [],
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
