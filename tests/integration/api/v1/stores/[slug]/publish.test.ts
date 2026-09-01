import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";
import storeCuration from "models/store_curation";
import storeFeaturedGame from "models/store_featured_game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function seedReadyDraft(ownerId: string, name: string) {
  const outlet = await orchestrator.createStore(ownerId, {
    name,
    description: "A complete creator biography.",
    tagline: "Five carefully selected games",
    logo_url: "https://example.com/logo.png",
    cover_url: "https://example.com/cover.jpg",
    draft: true,
  });
  const studio = await orchestrator.createStudio(ownerId, {
    name: `${name} Studio`,
  });
  const games = [];
  for (let index = 0; index < 7; index++) {
    games.push(
      await orchestrator.createGame(ownerId, {
        studio_id: studio.id,
        title: `${name} Game ${index}`,
        tags: ["curated"],
      }),
    );
  }
  await prisma.game.updateMany({
    where: { id: { in: games.map(({ id }) => id) } },
    data: { status: "ACTIVE" },
  });
  await storeCuration.addGameOverride(outlet.id, games[0].slug, "HIDE");
  await storeFeaturedGame.replaceSelection(outlet.id, [
    { game_slug: games[1].slug, recommendation_reason: "Start here" },
  ]);

  return {
    outlet: await prisma.store.findUniqueOrThrow({ where: { id: outlet.id } }),
    games,
  };
}

describe("Outlet draft publication lifecycle", () => {
  test("returns structured blockers for an incomplete draft", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const draft = await orchestrator.createStore(owner.id, { draft: true });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${draft.slug}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "If-Match": '"1"',
        },
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      context: {
        publication_readiness: {
          ready: false,
          blockers: expect.arrayContaining([
            "IDENTITY_INCOMPLETE",
            "CURATION_STRATEGY_REQUIRED",
            "MINIMUM_GAMES_REQUIRED",
            "FEATURED_REQUIRED",
          ]),
        },
      },
    });
  });

  test("keeps a draft private, publishes one immutable revision, then unpublishes", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const { outlet: createdStore } = await seedReadyDraft(
      owner.id,
      "Private First Draft",
    );
    const endpoint = `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`;
    const authHeaders = { Cookie: `session_id=${session.token}` };

    const publicDraft = await fetch(endpoint);
    expect(publicDraft.status).toBe(404);

    const anonymousPreview = await fetch(`${endpoint}?preview=1`);
    expect(anonymousPreview.status).toBe(404);

    const preview = await fetch(`${endpoint}?preview=1`, {
      headers: authHeaders,
    });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(preview.headers.get("x-robots-tag")).toContain("noindex");
    expect(preview.headers.get("etag")).toBe(
      `"${createdStore.draft_revision}"`,
    );
    expect(await preview.json()).toMatchObject({
      publication_status: "DRAFT",
      draft_revision: createdStore.draft_revision,
      has_unpublished_changes: true,
      publication_readiness: { ready: true },
    });

    const publish = await fetch(`${endpoint}/publish`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "If-Match": `"${createdStore.draft_revision}"`,
      },
    });
    expect(publish.status).toBe(200);
    const publishBody = await publish.json();
    expect(publishBody).toMatchObject({
      publication_status: "PUBLISHED",
      draft_revision: createdStore.draft_revision + 1,
      has_unpublished_changes: false,
      published_at: expect.any(String),
    });

    const publicPublished = await fetch(endpoint);
    expect(publicPublished.status).toBe(200);
    const publicBody = await publicPublished.json();
    expect(publicBody).toMatchObject({
      slug: createdStore.slug,
      name: "Private First Draft",
      publication_status: "PUBLISHED",
      published_at: expect.any(String),
    });
    expect(publicBody).not.toHaveProperty("draft_revision");
    expect(publicBody).not.toHaveProperty("has_unpublished_changes");

    const cleanPreview = await fetch(`${endpoint}?preview=1`, {
      headers: authHeaders,
    });
    expect(await cleanPreview.json()).toMatchObject({
      has_unpublished_changes: false,
    });

    const unpublish = await fetch(`${endpoint}/publish`, {
      method: "DELETE",
      headers: {
        ...authHeaders,
        "If-Match": `"${publishBody.draft_revision}"`,
      },
    });
    expect(unpublish.status).toBe(200);
    expect(await unpublish.json()).toMatchObject({
      publication_status: "DRAFT",
    });
    expect((await fetch(endpoint)).status).toBe(404);
  });

  test("PATCH never changes live presentation until a matching publish", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const { outlet: createdStore } = await seedReadyDraft(
      owner.id,
      "Published Identity",
    );
    const endpoint = `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`;
    const headers = {
      "Content-Type": "application/json",
      Cookie: `session_id=${session.token}`,
    };
    const initialPublish = await fetch(`${endpoint}/publish`, {
      method: "POST",
      headers: {
        Cookie: `session_id=${session.token}`,
        "If-Match": `"${createdStore.draft_revision}"`,
      },
    });
    expect(initialPublish.status).toBe(200);
    const initiallyPublished = await initialPublish.json();

    const save = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        ...headers,
        "If-Match": `"${initiallyPublished.draft_revision}"`,
      },
      body: JSON.stringify({
        name: "Draft Identity",
        tagline: "Only in preview",
      }),
    });
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({
      slug: createdStore.slug,
      name: "Draft Identity",
      draft_revision: initiallyPublished.draft_revision + 1,
      has_unpublished_changes: true,
    });

    expect(await (await fetch(endpoint)).json()).toMatchObject({
      slug: createdStore.slug,
      name: "Published Identity",
      tagline: "Five carefully selected games",
    });
    expect(
      await (
        await fetch(`${endpoint}?preview=1`, {
          headers: { Cookie: `session_id=${session.token}` },
        })
      ).json(),
    ).toMatchObject({ name: "Draft Identity", tagline: "Only in preview" });

    const stalePublish = await fetch(`${endpoint}/publish`, {
      method: "POST",
      headers: {
        Cookie: `session_id=${session.token}`,
        "If-Match": `"${initiallyPublished.draft_revision}"`,
      },
    });
    expect(stalePublish.status).toBe(409);
    expect(await (await fetch(endpoint)).json()).toMatchObject({
      name: "Published Identity",
    });

    const publish = await fetch(`${endpoint}/publish`, {
      method: "POST",
      headers: {
        Cookie: `session_id=${session.token}`,
        "If-Match": `"${initiallyPublished.draft_revision + 1}"`,
      },
    });
    expect(publish.status).toBe(200);
    expect(await (await fetch(endpoint)).json()).toMatchObject({
      slug: createdStore.slug,
      name: "Draft Identity",
      tagline: "Only in preview",
    });
  });

  test("keeps curation and Featured draft-only, then switches both together", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const { outlet, games } = await seedReadyDraft(
      owner.id,
      "Atomic Curation Outlet",
    );
    const base = `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}`;
    const cookie = `session_id=${session.token}`;

    expect(
      await fetch(`${base}/publish`, {
        method: "POST",
        headers: { Cookie: cookie, "If-Match": `"${outlet.draft_revision}"` },
      }),
    ).toMatchObject({ status: 200 });

    const initialPublicFeatured = await (
      await fetch(`${base}/featured`)
    ).json();
    expect(initialPublicFeatured.games[0]).toMatchObject({
      id: games[1].id,
      recommendation_reason: "Start here",
    });

    const hideDraftGame = await fetch(`${base}/game-overrides`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ game_slug: games[2].slug, visibility: "HIDE" }),
    });
    expect(hideDraftGame.status).toBe(201);
    const updateDraftFeatured = await fetch(`${base}/featured?preview=1`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendations: [
          {
            game_slug: games[1].slug,
            recommendation_reason: "Updated draft reason",
          },
        ],
      }),
    });
    expect(updateDraftFeatured.status).toBe(200);

    const publicBeforeRepublish = await (
      await fetch(`${base}/search?limit=100`)
    ).json();
    const previewBeforeRepublish = await (
      await fetch(`${base}/search?preview=1&limit=100`, {
        headers: { Cookie: cookie },
      })
    ).json();
    expect(
      publicBeforeRepublish.games.map(({ id }: { id: string }) => id),
    ).toContain(games[2].id);
    expect(
      previewBeforeRepublish.games.map(({ id }: { id: string }) => id),
    ).not.toContain(games[2].id);
    expect(
      (await (await fetch(`${base}/featured`)).json()).games[0],
    ).toMatchObject({ recommendation_reason: "Start here" });
    expect(
      (
        await (
          await fetch(`${base}/featured?preview=1`, {
            headers: { Cookie: cookie },
          })
        ).json()
      ).games[0],
    ).toMatchObject({ recommendation_reason: "Updated draft reason" });

    const latestPreview = await fetch(`${base}?preview=1`, {
      headers: { Cookie: cookie },
    });
    const republish = await fetch(`${base}/publish`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "If-Match": latestPreview.headers.get("etag")!,
      },
    });
    expect(republish.status).toBe(200);

    const publicAfterRepublish = await (
      await fetch(`${base}/search?limit=100`)
    ).json();
    expect(
      publicAfterRepublish.games.map(({ id }: { id: string }) => id),
    ).not.toContain(games[2].id);
    expect(
      (await (await fetch(`${base}/featured`)).json()).games[0],
    ).toMatchObject({ recommendation_reason: "Updated draft reason" });
  });

  test("does not let an update:store member publish", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      draft: true,
    });
    const member = await orchestrator.createUser();
    await orchestrator.activateUser(member.id);
    await orchestrator.addStoreMember(createdStore.id, member.username, [
      "update:store",
    ]);
    const session = await orchestrator.createSession(member.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "If-Match": '"1"',
        },
      },
    );

    expect(response.status).toBe(403);
  });

  test("returns one success and one conflict for simultaneous publishes", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const { outlet: createdStore } = await seedReadyDraft(
      owner.id,
      "Concurrent Publish Outlet",
    );
    const endpoint = `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/publish`;
    const publishRequest = () =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          Cookie: `session_id=${session.token}`,
          "If-Match": `"${createdStore.draft_revision}"`,
        },
      });

    const responses = await Promise.all([publishRequest(), publishRequest()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    await expect(
      prisma.storeRevision.count({ where: { store_id: createdStore.id } }),
    ).resolves.toBe(1);
  });
});
