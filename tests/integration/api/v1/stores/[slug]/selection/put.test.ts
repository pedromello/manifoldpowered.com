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

describe("PUT /api/v1/stores/[slug]/selection", () => {
  test("atomically persists a handpicked initial selection", async () => {
    const fixture = await createCurationFixture();
    const games = await createPublicGames(
      fixture.owner.id,
      5,
      "Handpicked Apply",
    );
    const gameSlugs = games.map(({ slug }) => slug);

    const response = await fetch(storeApiUrl(fixture.store.slug, "selection"), {
      method: "PUT",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: gameSlugs,
        expected_draft_revision: fixture.store.draft_revision,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      strategy: "HANDPICKED",
      catalog_mode: "SELECTED",
      tags: [],
      game_slugs: gameSlugs,
      catalog_game_count: 5,
      draft_revision: fixture.store.draft_revision + 1,
    });
    expect(
      await prisma.storeGameOverride.findMany({
        where: { store_id: fixture.store.id },
        select: { game_id: true, visibility: true },
      }),
    ).toEqual(
      expect.arrayContaining(
        games.map(({ id }) => ({ game_id: id, visibility: "SHOW" })),
      ),
    );
    expect(
      (
        await prisma.store.findUniqueOrThrow({
          where: { id: fixture.store.id },
        })
      ).catalog_mode,
    ).toBe("SELECTED");
  });

  test("rolls back unavailable games and rejects a stale revision", async () => {
    const fixture = await createCurationFixture();
    const games = await createPublicGames(fixture.owner.id, 4, "Rollback");
    const body = {
      strategy: "HANDPICKED",
      tags: [],
      game_slugs: [...games.map(({ slug }) => slug), "missing-game"],
      expected_draft_revision: fixture.store.draft_revision,
    };
    const unavailable = await fetch(
      storeApiUrl(fixture.store.slug, "selection"),
      {
        method: "PUT",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify(body),
      },
    );

    expect(unavailable.status).toBe(400);
    await expect(unavailable.json()).resolves.toEqual(
      expect.objectContaining({
        name: "ValidationError",
        status_code: 400,
        context: { game_slugs: ["missing-game"] },
      }),
    );
    await expect(
      prisma.storeGameOverride.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);

    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { draft_revision: { increment: 1 } },
    });
    const stale = await fetch(storeApiUrl(fixture.store.slug, "selection"), {
      method: "PUT",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify(body),
    });
    expect(stale.status).toBe(409);
  });

  test("rejects malformed, anonymous and cross-Outlet requests", async () => {
    const fixture = await createCurationFixture();
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "selection");
    const validShape = JSON.stringify({
      strategy: "FOCUSED",
      tags: ["rpg"],
      game_slugs: [],
      expected_draft_revision: fixture.store.draft_revision,
    });

    const malformed = await fetch(url, {
      method: "PUT",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({ strategy: "FOCUSED", tags: [] }),
    });
    const anonymous = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: validShape,
    });
    const outsider = await fetch(url, {
      method: "PUT",
      headers: authenticatedJsonHeaders(outsiderSession.token),
      body: validShape,
    });

    expect(malformed.status).toBe(400);
    expect(anonymous.status).toBe(403);
    expect(outsider.status).toBe(403);
  });
});
