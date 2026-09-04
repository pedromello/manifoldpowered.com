import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameModel from "models/game";
import storeModel from "models/store";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createLifecycleActor,
  createReadyDraft,
  libraryRequest,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("Outlet publication lifecycle", () => {
  test("POST creates a private DRAFT with an explicit undecided catalog", async () => {
    const { user, sessionToken } = await createLifecycleActor();
    const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
      method: "POST",
      headers: authenticatedJsonHeaders(sessionToken),
      body: JSON.stringify({
        name: "Lifecycle First Draft",
        description: "Not live until its creator publishes it.",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        slug: "lifecycle-first-draft",
        owner_id: user.id,
        status: "DRAFT",
        catalog_mode: "UNDECIDED",
        draft_revision: 1,
        published_at: null,
        last_published_at: null,
        published_revision: null,
        storefront_source: "DRAFT",
      }),
    );

    const stored = await prisma.store.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(stored).toEqual(
      expect.objectContaining({
        status: "DRAFT",
        catalog_mode: "UNDECIDED",
        draft_revision: 1,
        published_revision_id: null,
        last_published_revision_id: null,
      }),
    );
    expect(
      await prisma.storeRevision.count({ where: { store_id: stored.id } }),
    ).toBe(0);
    expect(
      await prisma.storeLifecycleEvent.count({
        where: { store_id: stored.id },
      }),
    ).toBe(0);

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${stored.slug}`,
    );
    expect(publicResponse.status).toBe(404);

    const directoryResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/public/stores?q=${encodeURIComponent(stored.name)}`,
    );
    expect(directoryResponse.status).toBe(200);
    expect((await directoryResponse.json()).stores).toEqual([]);
  });

  test("preview is private for an owner or editor and indistinguishable from missing for everyone else", async () => {
    const owner = await createLifecycleActor();
    const draft = await orchestrator.createStore(owner.user.id, {
      status: "DRAFT",
      name: "Preview Authorization Draft",
    });
    const editor = await createLifecycleActor();
    await orchestrator.addStoreMember(draft.id, editor.user.username, [
      "update:store",
    ]);
    const outsider = await createLifecycleActor();
    const previewUrl = `${webserver.getOrigin()}/api/v1/stores/${draft.slug}?preview=1`;

    const anonymousResponse = await fetch(previewUrl);
    const anonymousBody = await anonymousResponse.json();
    const outsiderResponse = await fetch(previewUrl, {
      headers: { Cookie: `session_id=${outsider.sessionToken}` },
    });
    const outsiderBody = await outsiderResponse.json();

    expect(anonymousResponse.status).toBe(404);
    expect(outsiderResponse.status).toBe(404);
    expect(outsiderBody).toEqual(anonymousBody);
    expect(anonymousBody).toEqual({
      message: `Store with slug "${draft.slug}" was not found.`,
      name: "NotFoundError",
      action: "Check the slug and try again.",
      status_code: 404,
    });
    expectPrivatePreviewHeaders(anonymousResponse);
    expectPrivatePreviewHeaders(outsiderResponse);

    for (const sessionToken of [owner.sessionToken, editor.sessionToken]) {
      const authorizedResponse = await fetch(previewUrl, {
        headers: { Cookie: `session_id=${sessionToken}` },
      });
      expect(authorizedResponse.status).toBe(200);
      expectPrivatePreviewHeaders(authorizedResponse);
      await expect(authorizedResponse.json()).resolves.toEqual(
        expect.objectContaining({
          id: draft.id,
          status: "DRAFT",
          catalog_mode: "UNDECIDED",
          storefront_source: "DRAFT",
        }),
      );
    }

    const ownerWithoutPreview = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${draft.slug}`,
      { headers: { Cookie: `session_id=${owner.sessionToken}` } },
    );
    expect(ownerWithoutPreview.status).toBe(404);
  });

  test("draft readers follow content capabilities without granting financial delegates access", async () => {
    const owner = await createLifecycleActor();
    const draft = await orchestrator.createStore(owner.user.id, {
      status: "DRAFT",
      name: "Capability Aligned Draft",
    });
    const editor = await createLifecycleActor();
    const publisher = await createLifecycleActor();
    const featuredEditor = await createLifecycleActor();
    const financialDelegate = await createLifecycleActor();
    await orchestrator.addStoreMember(draft.id, editor.user.username, [
      "update:store",
    ]);
    await orchestrator.addStoreMember(draft.id, publisher.user.username, [
      "publish:store",
    ]);
    await orchestrator.addStoreMember(draft.id, featuredEditor.user.username, [
      "manage:store_featured_games",
    ]);
    await orchestrator.addStoreMember(
      draft.id,
      financialDelegate.user.username,
      ["read:store_statement"],
    );

    const previewUrl = `${webserver.getOrigin()}/api/v1/stores/${draft.slug}?preview=1`;
    const publicationUrl = `${webserver.getOrigin()}/api/v1/stores/${draft.slug}/publication`;
    for (const actor of [owner, editor, publisher, featuredEditor]) {
      const [preview, readiness] = await Promise.all([
        fetch(previewUrl, {
          headers: { Cookie: `session_id=${actor.sessionToken}` },
        }),
        fetch(publicationUrl, {
          headers: { Cookie: `session_id=${actor.sessionToken}` },
        }),
      ]);
      expect(preview.status).toBe(200);
      expect(readiness.status).toBe(200);
      expectPrivatePreviewHeaders(preview);
      expectPrivatePreviewHeaders(readiness);
    }

    const [financialPreview, financialReadiness, anonymousReadiness] =
      await Promise.all([
        fetch(previewUrl, {
          headers: {
            Cookie: `session_id=${financialDelegate.sessionToken}`,
          },
        }),
        fetch(publicationUrl, {
          headers: {
            Cookie: `session_id=${financialDelegate.sessionToken}`,
          },
        }),
        fetch(publicationUrl),
      ]);
    expect(financialPreview.status).toBe(404);
    expect(financialReadiness.status).toBe(403);
    expect(anonymousReadiness.status).toBe(401);
  });

  test("readiness v2 returns structured blockers without publishing partial work", async () => {
    const owner = await createLifecycleActor();
    const draft = await orchestrator.createStore(owner.user.id, {
      status: "DRAFT",
      name: "Readiness Blockers Draft",
      description: "",
    });
    const publicationUrl = `${webserver.getOrigin()}/api/v1/stores/${draft.slug}/publication`;

    const initialResponse = await fetch(publicationUrl, {
      headers: { Cookie: `session_id=${owner.sessionToken}` },
    });
    expect(initialResponse.status).toBe(200);
    expectPrivatePreviewHeaders(initialResponse);
    const initial = await initialResponse.json();
    expect(initial.readiness).toEqual(
      expect.objectContaining({
        version: 2,
        ready: false,
        catalog_game_count: 0,
        checks: {
          brand_complete: false,
          visual_identity: false,
          catalog_intentional: false,
          catalog_has_games: false,
          editorial_highlight: false,
        },
      }),
    );
    expect(blockerCodes(initial)).toEqual(
      expect.arrayContaining([
        "BRAND_INCOMPLETE",
        "VISUAL_IDENTITY_UNSELECTED",
        "CATALOG_MODE_UNDECIDED",
        "CATALOG_TOO_SMALL",
        "FEATURED_COUNT_INVALID",
      ]),
    );

    const selectedResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${draft.slug}`,
      {
        method: "PATCH",
        headers: {
          ...authenticatedJsonHeaders(owner.sessionToken),
          "If-Match": `"${draft.draft_revision}"`,
        },
        body: JSON.stringify({
          description: "The brand is now complete.",
          logo_url: "https://example.com/readiness.png",
          catalog_mode: "SELECTED",
        }),
      },
    );
    expect(selectedResponse.status).toBe(200);

    const game = await orchestrator.createGame(owner.user.id, {
      title: "Outside Empty Selected Catalog",
      price: 0,
    });
    await gameModel.makePublic(game.id);
    await prisma.storeFeaturedGame.create({
      data: {
        store_id: draft.id,
        game_id: game.id,
        position: 1,
        recommendation_reason: null,
      },
    });

    const selectedStateResponse = await fetch(publicationUrl, {
      headers: { Cookie: `session_id=${owner.sessionToken}` },
    });
    const selectedState = await selectedStateResponse.json();
    expect(selectedState.readiness.version).toBe(2);
    expect(selectedState.readiness.ready).toBe(false);
    expect(blockerCodes(selectedState)).toEqual(
      expect.arrayContaining([
        "SELECTED_CATALOG_WITHOUT_INCLUSIONS",
        "CATALOG_TOO_SMALL",
        "FEATURED_REASON_MISSING",
        "FEATURED_OUTSIDE_CATALOG",
      ]),
    );

    const rejectedPublish = await publicationRequest(
      draft.slug,
      owner.sessionToken,
      "publish",
      selectedState.draft_revision,
    );
    expect(rejectedPublish.status).toBe(400);
    const rejectedBody = await rejectedPublish.json();
    expect(rejectedBody.name).toBe("ValidationError");
    expect(rejectedBody.context.readiness.version).toBe(2);
    expect(rejectedBody.context.readiness.ready).toBe(false);
    expect(
      await prisma.storeRevision.count({ where: { store_id: draft.id } }),
    ).toBe(0);
    expect(
      await prisma.storeLifecycleEvent.count({
        where: { store_id: draft.id },
      }),
    ).toBe(0);
  });

  test("publish freezes a complete revision; draft edits stay private until a non-redundant republish", async () => {
    const fixture = await createReadyDraft("Frozen Revision");
    const initialDraftRevision = fixture.store.draft_revision;

    const firstPublish = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      initialDraftRevision,
    );
    expect(firstPublish.status).toBe(200);
    expectPrivatePreviewHeaders(firstPublish);
    const firstPublication = await firstPublish.json();
    expect(firstPublication).toEqual(
      expect.objectContaining({
        status: "PUBLISHED",
        draft_revision: initialDraftRevision,
        readiness: expect.objectContaining({ version: 2, ready: true }),
        published_revision: expect.objectContaining({
          revision: 1,
          source_draft_revision: initialDraftRevision,
        }),
      }),
    );

    const firstRevision = await prisma.storeRevision.findUniqueOrThrow({
      where: { id: firstPublication.published_revision.id },
    });
    expect(firstRevision).toEqual(
      expect.objectContaining({
        store_id: fixture.store.id,
        actor_user_id: fixture.user.id,
        catalog_mode: "ALL",
        name: fixture.store.name,
        source_draft_revision: initialDraftRevision,
        featured_games: [
          expect.objectContaining({
            game_id: fixture.games[0].id,
            position: 1,
            recommendation_reason: "The defining game in this collection.",
          }),
        ],
        presentation: {
          version: 1,
          layout_preset: "channel",
          tagline: null,
          cover_image_url: null,
          social_links: {},
          brand_tokens: {
            palette: "manifold",
            typography: "modern",
            shape: "soft",
          },
          theme_key: null,
        },
      }),
    );

    const redundantPublish = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      initialDraftRevision,
    );
    expect(redundantPublish.status).toBe(409);
    expect((await redundantPublish.json()).name).toBe("ConflictError");

    const renamed = "A New Draft Identity";
    const renameResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
      {
        method: "PATCH",
        headers: {
          ...authenticatedJsonHeaders(fixture.sessionToken),
          "If-Match": `"${initialDraftRevision}"`,
        },
        body: JSON.stringify({
          name: renamed,
          description: "This description is still only in the working draft.",
        }),
      },
    );
    expect(renameResponse.status).toBe(200);
    expect((await renameResponse.json()).slug).toBe(fixture.store.slug);
    await orchestrator.addStoreTagFilter(
      fixture.store.id,
      "lifecycle-blocked",
      "BLACKLIST",
    );
    const featuredDraftRevision = (
      await prisma.store.findUniqueOrThrow({
        where: { id: fixture.store.id },
        select: { draft_revision: true },
      })
    ).draft_revision;
    const replaceFeaturedResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/featured`,
      {
        method: "PUT",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          expected_draft_revision: featuredDraftRevision,
          recommendations: [
            {
              game_slug: fixture.games[1].slug,
              recommendation_reason: "The new draft-only editorial choice.",
            },
          ],
        }),
      },
    );
    expect(replaceFeaturedResponse.status).toBe(200);

    const editedDraft = await prisma.store.findUniqueOrThrow({
      where: { id: fixture.store.id },
    });
    expect(editedDraft.draft_revision).toBe(initialDraftRevision + 3);
    expect(editedDraft.slug).toBe(fixture.store.slug);

    const liveBeforeRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
    );
    expect(liveBeforeRepublish.status).toBe(200);
    expect((await liveBeforeRepublish.json()).name).toBe(fixture.store.name);
    const featuredBeforeRepublish = await outletGames(
      fixture.store.slug,
      "featured",
    );
    expect(featuredBeforeRepublish.games[0]).toEqual(
      expect.objectContaining({
        id: fixture.games[0].id,
        recommendation_reason: "The defining game in this collection.",
      }),
    );
    const searchBeforeRepublish = await outletGames(
      fixture.store.slug,
      "search",
    );
    expect(gameIds(searchBeforeRepublish)).toContain(fixture.games[4].id);

    const previewResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}?preview=1`,
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    expect(previewResponse.status).toBe(200);
    expectPrivatePreviewHeaders(previewResponse);
    expect((await previewResponse.json()).name).toBe(renamed);

    const stalePublish = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      initialDraftRevision,
    );
    expect(stalePublish.status).toBe(409);
    expect(await stalePublish.json()).toEqual(
      expect.objectContaining({
        name: "ConflictError",
        context: expect.objectContaining({
          expected_draft_revision: initialDraftRevision,
          actual_draft_revision: editedDraft.draft_revision,
        }),
      }),
    );

    const republish = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      editedDraft.draft_revision,
    );
    expect(republish.status).toBe(200);
    const republished = await republish.json();
    expect(republished.published_revision).toEqual(
      expect.objectContaining({
        revision: 2,
        source_draft_revision: editedDraft.draft_revision,
      }),
    );

    const liveAfterRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
    );
    expect((await liveAfterRepublish.json()).name).toBe(renamed);
    const featuredAfterRepublish = await outletGames(
      fixture.store.slug,
      "featured",
    );
    expect(featuredAfterRepublish.games[0]).toEqual(
      expect.objectContaining({
        id: fixture.games[1].id,
        recommendation_reason: "The new draft-only editorial choice.",
      }),
    );
    const searchAfterRepublish = await outletGames(
      fixture.store.slug,
      "search",
    );
    expect(gameIds(searchAfterRepublish)).not.toContain(fixture.games[4].id);

    expect(
      await prisma.storeRevision.findUniqueOrThrow({
        where: { id: firstRevision.id },
      }),
    ).toEqual(firstRevision);
    const events = await prisma.storeLifecycleEvent.findMany({
      where: { store_id: fixture.store.id },
      orderBy: { created_at: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events).toEqual([
      expect.objectContaining({
        action: "PUBLISH",
        from_status: "DRAFT",
        to_status: "PUBLISHED",
        actor_user_id: fixture.user.id,
        store_revision_id: firstRevision.id,
      }),
      expect.objectContaining({
        action: "PUBLISH",
        from_status: "PUBLISHED",
        to_status: "PUBLISHED",
        actor_user_id: fixture.user.id,
        store_revision_id: republished.published_revision.id,
      }),
    ]);
  });

  test("simultaneous publish attempts create one revision and one audit event", async () => {
    const fixture = await createReadyDraft("Concurrent Publish");

    const responses = await Promise.all([
      publicationRequest(
        fixture.store.slug,
        fixture.sessionToken,
        "publish",
        fixture.store.draft_revision,
      ),
      publicationRequest(
        fixture.store.slug,
        fixture.sessionToken,
        "publish",
        fixture.store.draft_revision,
      ),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    for (const response of responses) expectPrivatePreviewHeaders(response);
    expect(
      await prisma.storeRevision.count({
        where: { store_id: fixture.store.id },
      }),
    ).toBe(1);
    expect(
      await prisma.storeLifecycleEvent.count({
        where: { store_id: fixture.store.id, action: "PUBLISH" },
      }),
    ).toBe(1);

    const stored = await prisma.store.findUniqueOrThrow({
      where: { id: fixture.store.id },
    });
    expect(stored.status).toBe("PUBLISHED");
    expect(stored.published_revision_id).not.toBeNull();
  });

  test("revalidates a publisher inside the lifecycle transaction after revocation", async () => {
    const fixture = await createReadyDraft("Revoked Publisher");
    const publisher = await createLifecycleActor();
    await orchestrator.addStoreMember(
      fixture.store.id,
      publisher.user.username,
      ["publish:store"],
    );
    await prisma.storeMember.delete({
      where: {
        store_id_user_id: {
          store_id: fixture.store.id,
          user_id: publisher.user.id,
        },
      },
    });

    await expect(
      storeModel.changePublication(
        fixture.store.id,
        publisher.user.id,
        "publish",
        fixture.store.draft_revision,
      ),
    ).rejects.toMatchObject({ name: "ForbiddenError", statusCode: 403 });
    await expect(
      prisma.store.findUniqueOrThrow({ where: { id: fixture.store.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: "DRAFT" }));
    await expect(
      prisma.storeRevision.count({ where: { store_id: fixture.store.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.storeLifecycleEvent.count({
        where: { store_id: fixture.store.id },
      }),
    ).resolves.toBe(0);
  });

  test("unpublish preserves followers, attribution history and last publication while every public surface fails closed", async () => {
    const fixture = await createReadyDraft("Unpublish Preservation");
    const publishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      fixture.store.draft_revision,
    );
    const published = await publishResponse.json();
    const publishedRevisionId = published.published_revision.id as string;
    const publishedAt = new Date(published.published_at as string);

    const follower = await createLifecycleActor();
    const followResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows`,
      {
        method: "POST",
        headers: authenticatedJsonHeaders(follower.sessionToken),
        body: JSON.stringify({ store_slug: fixture.store.slug }),
      },
    );
    expect(followResponse.status).toBe(201);

    const buyer = await createLifecycleActor();
    const acquisitionResponse = await libraryRequest(
      buyer.sessionToken,
      fixture.games[0].slug,
      fixture.store.slug,
    );
    expect(acquisitionResponse.status).toBe(201);
    const historicalSale = await prisma.sale.findFirstOrThrow({
      where: {
        user_id: buyer.user.id,
        game_id: fixture.games[0].id,
      },
    });
    expect(historicalSale.store_revision_id).toBe(publishedRevisionId);

    const sitemapBefore = await fetch(`${webserver.getOrigin()}/sitemap.xml`);
    expect(await sitemapBefore.text()).toContain(
      `/store/${fixture.store.slug}`,
    );

    const unpublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "unpublish",
      fixture.store.draft_revision,
    );
    expect(unpublishResponse.status).toBe(200);
    expectPrivatePreviewHeaders(unpublishResponse);
    const unpublished = await unpublishResponse.json();
    expect(unpublished).toEqual(
      expect.objectContaining({
        status: "DRAFT",
        published_at: null,
        last_published_at: publishedAt.toISOString(),
        published_revision: null,
      }),
    );

    const stored = await prisma.store.findUniqueOrThrow({
      where: { id: fixture.store.id },
    });
    expect(stored).toEqual(
      expect.objectContaining({
        status: "DRAFT",
        published_revision_id: null,
        last_published_revision_id: publishedRevisionId,
        published_at: null,
      }),
    );
    expect(stored.last_published_at?.getTime()).toBe(publishedAt.getTime());
    expect(
      await prisma.storeRevision.count({
        where: { store_id: fixture.store.id },
      }),
    ).toBe(1);
    expect(
      await prisma.storeFollow.count({
        where: { user_id: follower.user.id, store_id: fixture.store.id },
      }),
    ).toBe(1);
    expect(
      await prisma.sale.findUniqueOrThrow({ where: { id: historicalSale.id } }),
    ).toEqual(historicalSale);

    const publicResponses = await Promise.all([
      fetch(`${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`),
      fetch(
        `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/featured`,
      ),
      fetch(
        `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/search`,
      ),
      fetch(
        `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/trending`,
      ),
      fetch(
        `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/new-releases`,
      ),
      fetch(
        `${webserver.getOrigin()}/api/v1/store-follows/status?store_slug=${fixture.store.slug}`,
      ),
      fetch(`${webserver.getOrigin()}/api/og/outlet/${fixture.store.slug}`),
    ]);
    expect(publicResponses.map(({ status }) => status)).toEqual([
      404, 404, 404, 404, 404, 404, 404,
    ]);

    const directoryResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/public/stores?q=${encodeURIComponent(fixture.store.name)}`,
    );
    expect((await directoryResponse.json()).stores).toEqual([]);
    const followedResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows`,
      { headers: { Cookie: `session_id=${follower.sessionToken}` } },
    );
    expect((await followedResponse.json()).stores).toEqual([]);

    const sitemapAfter = await fetch(`${webserver.getOrigin()}/sitemap.xml`);
    expect(sitemapAfter.headers.get("cache-control")).toContain("no-store");
    expect(await sitemapAfter.text()).not.toContain(
      `/store/${fixture.store.slug}`,
    );

    const ownerPreview = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}?preview=1`,
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    expect(ownerPreview.status).toBe(200);
    expectPrivatePreviewHeaders(ownerPreview);
    expect((await ownerPreview.json()).status).toBe("DRAFT");

    const events = await prisma.storeLifecycleEvent.findMany({
      where: { store_id: fixture.store.id },
      orderBy: { created_at: "asc" },
    });
    expect(events.map(({ action }) => action)).toEqual([
      "PUBLISH",
      "UNPUBLISH",
    ]);
    expect(events[1]).toEqual(
      expect.objectContaining({
        store_revision_id: publishedRevisionId,
        actor_user_id: fixture.user.id,
        from_status: "PUBLISHED",
        to_status: "DRAFT",
      }),
    );
  });

  test("grandfathers an already-published classic snapshot while requiring an explicit visual choice for the next publication", async () => {
    const fixture = await createReadyDraft("Classic Snapshot Compatibility");
    const firstPublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      fixture.store.draft_revision,
    );
    expect(firstPublishResponse.status).toBe(200);
    const firstPublication = await firstPublishResponse.json();
    const revisionId = firstPublication.published_revision.id as string;
    const publishedRevision = await prisma.storeRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });

    // Simulate a snapshot written before explicit preset selection existed.
    // Public rendering is revision-based, so this immutable historical shape
    // remains serviceable even though a future draft publication is stricter.
    await prisma.storeRevision.update({
      where: { id: revisionId },
      data: {
        presentation: {
          ...(publishedRevision.presentation as Record<string, unknown>),
          theme_key: null,
          layout_preset: null,
        },
      },
    });
    const classicDraft = await prisma.store.update({
      where: { id: fixture.store.id },
      data: {
        layout_preset: null,
        name: "A private classic-layout draft edit",
        draft_revision: { increment: 1 },
      },
    });

    const publicBeforeRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
    );
    expect(publicBeforeRepublish.status).toBe(200);
    const publicSnapshot = await publicBeforeRepublish.json();
    expect(publicSnapshot).toEqual(
      expect.objectContaining({
        name: fixture.store.name,
        layout_preset: null,
      }),
    );

    const readinessResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/publication`,
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    const readiness = await readinessResponse.json();
    expect(readiness.readiness.checks.visual_identity).toBe(false);
    expect(blockerCodes(readiness)).toContain("VISUAL_IDENTITY_UNSELECTED");

    const rejectedRepublish = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      classicDraft.draft_revision,
    );
    expect(rejectedRepublish.status).toBe(400);
    expect(blockerCodes((await rejectedRepublish.json()).context)).toContain(
      "VISUAL_IDENTITY_UNSELECTED",
    );
    expect(
      await prisma.storeRevision.count({
        where: { store_id: fixture.store.id },
      }),
    ).toBe(1);
    const publicAfterRejectedRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
    );
    expect(publicAfterRejectedRepublish.status).toBe(200);
  });
});

function blockerCodes(publication: {
  readiness: { blockers: Array<{ code: string }> };
}) {
  return publication.readiness.blockers.map(({ code }) => code);
}

function expectPrivatePreviewHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(
    response.headers
      .get("vary")
      ?.split(",")
      .map((value) => value.trim().toLowerCase()),
  ).toContain("cookie");
}

async function outletGames(slug: string, feed: "featured" | "search") {
  const response = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${slug}/${feed}`,
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{ games: Array<Record<string, unknown>> }>;
}

function gameIds(result: { games: Array<Record<string, unknown>> }) {
  return result.games.map(({ id }) => id);
}
