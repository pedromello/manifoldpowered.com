import webserver from "infra/webserver";
import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import { createReadyDraft } from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

function editorialUrl(storeSlug: string, gameSlug: string, preview = false) {
  return `${webserver.getOrigin()}/api/v1/stores/${storeSlug}/game-editorials/${gameSlug}${preview ? "?preview=1" : ""}`;
}

describe("GET /api/v1/stores/[slug]/game-editorials/[gameSlug]", () => {
  test("returns the published review publicly and the newer draft only to authorized preview readers", async () => {
    const fixture = await createReadyDraft("Editorial Read Boundary");
    await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.store.id,
        game_id: fixture.games[0].id,
        headline: "Published headline",
        body: "Published review body.",
      },
    });
    await orchestrator.publishStore(fixture.store.id, fixture.user.id);
    await prisma.storeGameEditorial.update({
      where: {
        store_id_game_id: {
          store_id: fixture.store.id,
          game_id: fixture.games[0].id,
        },
      },
      data: {
        headline: "Draft headline",
        body: "Draft review body.",
      },
    });

    const publicResponse = await fetch(
      editorialUrl(fixture.store.slug, fixture.games[0].slug),
    );
    expect(publicResponse.status).toBe(200);
    await expect(publicResponse.json()).resolves.toEqual({
      review: {
        headline: "Published headline",
        body: "Published review body.",
      },
    });

    const previewResponse = await fetch(
      editorialUrl(fixture.store.slug, fixture.games[0].slug, true),
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(previewResponse.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow",
    );
    await expect(previewResponse.json()).resolves.toEqual({
      review: {
        headline: "Draft headline",
        body: "Draft review body.",
      },
    });

    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    const outsiderSession = await orchestrator.createSession(outsider.id);
    const outsiderPreview = await fetch(
      editorialUrl(fixture.store.slug, fixture.games[0].slug, true),
      { headers: { Cookie: `session_id=${outsiderSession.token}` } },
    );
    expect(outsiderPreview.status).toBe(404);
    await expect(outsiderPreview.json()).resolves.toEqual({
      message: `Store with slug "${fixture.store.slug}" was not found.`,
      name: "NotFoundError",
      action: "Check the slug and try again.",
      status_code: 404,
    });
  });

  test("returns a precise null review for an unknown game in a published Outlet", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "ALL",
    });

    const response = await fetch(
      editorialUrl(store.slug, "game-that-does-not-exist"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ review: null });
  });

  test("does not reveal whether an unpublished Outlet exists", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const draft = await orchestrator.createStore(owner.id, { draft: true });

    const response = await fetch(editorialUrl(draft.slug, "any-game"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: `Store with slug "${draft.slug}" was not found.`,
      name: "NotFoundError",
      action: "Check the slug and try again.",
      status_code: 404,
    });
  });
});
