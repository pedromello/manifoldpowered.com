import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createReadyDraft,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

function editorialUrl(storeSlug: string, gameSlug: string, preview = false) {
  return `${webserver.getOrigin()}/api/v1/stores/${storeSlug}/game-editorials/${gameSlug}${preview ? "?preview=1" : ""}`;
}

function putReview(
  storeSlug: string,
  gameSlug: string,
  sessionToken: string,
  expectedDraftRevision: number,
  headline: string,
  body: string,
) {
  return fetch(editorialUrl(storeSlug, gameSlug), {
    method: "PUT",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify({
      headline,
      body,
      expected_draft_revision: expectedDraftRevision,
    }),
  });
}

describe("Outlet editorial publication flow", () => {
  test("keeps every draft edit private until its matching publication", async () => {
    const fixture = await createReadyDraft("Editorial Publication");
    const game = fixture.games[0];
    const originalOutletName = fixture.store.name;

    const initialReviewResponse = await putReview(
      fixture.store.slug,
      game.slug,
      fixture.sessionToken,
      fixture.store.draft_revision,
      "First edition",
      "The review that belongs to the first publication.",
    );
    expect(initialReviewResponse.status).toBe(200);
    const initialReview = await initialReviewResponse.json();
    expect(initialReview).toEqual({
      review: {
        headline: "First edition",
        body: "The review that belongs to the first publication.",
      },
      draft_revision: fixture.store.draft_revision + 1,
    });

    const firstPublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      initialReview.draft_revision,
    );
    expect(firstPublishResponse.status).toBe(200);
    const firstPublication = await firstPublishResponse.json();
    expect(firstPublication.published_revision).toEqual(
      expect.objectContaining({
        revision: 1,
        source_draft_revision: initialReview.draft_revision,
      }),
    );

    const editedOutletName = `${originalOutletName} Updated`;
    const outletEditResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
      {
        method: "PATCH",
        headers: {
          ...authenticatedJsonHeaders(fixture.sessionToken),
          "If-Match": `"${initialReview.draft_revision}"`,
        },
        body: JSON.stringify({
          name: editedOutletName,
          description: "The description in the second working draft.",
        }),
      },
    );
    expect(outletEditResponse.status).toBe(200);
    const outletDraft = await outletEditResponse.json();
    expect(outletDraft).toEqual(
      expect.objectContaining({
        slug: fixture.store.slug,
        name: editedOutletName,
        draft_revision: initialReview.draft_revision + 1,
      }),
    );

    const secondReviewResponse = await putReview(
      fixture.store.slug,
      game.slug,
      fixture.sessionToken,
      outletDraft.draft_revision,
      "Second edition",
      "The review visible only in preview before republishing.",
    );
    expect(secondReviewResponse.status).toBe(200);
    const secondReview = await secondReviewResponse.json();

    const publicOutletBeforeRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
    );
    expect(publicOutletBeforeRepublish.status).toBe(200);
    await expect(publicOutletBeforeRepublish.json()).resolves.toEqual(
      expect.objectContaining({
        name: originalOutletName,
        storefront_source: "REVISION",
        published_revision: expect.objectContaining({ revision: 1 }),
      }),
    );
    const publicReviewBeforeRepublish = await fetch(
      editorialUrl(fixture.store.slug, game.slug),
    );
    expect(publicReviewBeforeRepublish.status).toBe(200);
    await expect(publicReviewBeforeRepublish.json()).resolves.toEqual({
      review: {
        headline: "First edition",
        body: "The review that belongs to the first publication.",
      },
    });

    const previewOutlet = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}?preview=1`,
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    expect(previewOutlet.status).toBe(200);
    await expect(previewOutlet.json()).resolves.toEqual(
      expect.objectContaining({
        name: editedOutletName,
        storefront_source: "DRAFT",
        draft_revision: secondReview.draft_revision,
      }),
    );
    const previewReview = await fetch(
      editorialUrl(fixture.store.slug, game.slug, true),
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    expect(previewReview.status).toBe(200);
    expect(previewReview.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    await expect(previewReview.json()).resolves.toEqual({
      review: {
        headline: "Second edition",
        body: "The review visible only in preview before republishing.",
      },
    });

    const secondPublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      secondReview.draft_revision,
    );
    expect(secondPublishResponse.status).toBe(200);
    const secondPublication = await secondPublishResponse.json();
    expect(secondPublication.published_revision).toEqual(
      expect.objectContaining({
        revision: 2,
        source_draft_revision: secondReview.draft_revision,
      }),
    );

    const publicOutletAfterRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
    );
    expect(publicOutletAfterRepublish.status).toBe(200);
    await expect(publicOutletAfterRepublish.json()).resolves.toEqual(
      expect.objectContaining({
        name: editedOutletName,
        published_revision: expect.objectContaining({ revision: 2 }),
      }),
    );
    const publicReviewAfterRepublish = await fetch(
      editorialUrl(fixture.store.slug, game.slug),
    );
    await expect(publicReviewAfterRepublish.json()).resolves.toEqual({
      review: {
        headline: "Second edition",
        body: "The review visible only in preview before republishing.",
      },
    });

    const thirdReviewResponse = await putReview(
      fixture.store.slug,
      game.slug,
      fixture.sessionToken,
      secondReview.draft_revision,
      "Third edition",
      "Another post-publication draft edit.",
    );
    expect(thirdReviewResponse.status).toBe(200);
    const thirdReview = await thirdReviewResponse.json();

    const publicWhileThirdIsDraft = await fetch(
      editorialUrl(fixture.store.slug, game.slug),
    );
    await expect(publicWhileThirdIsDraft.json()).resolves.toEqual({
      review: {
        headline: "Second edition",
        body: "The review visible only in preview before republishing.",
      },
    });
    const previewWhileThirdIsDraft = await fetch(
      editorialUrl(fixture.store.slug, game.slug, true),
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    await expect(previewWhileThirdIsDraft.json()).resolves.toEqual({
      review: {
        headline: "Third edition",
        body: "Another post-publication draft edit.",
      },
    });

    const thirdPublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      thirdReview.draft_revision,
    );
    expect(thirdPublishResponse.status).toBe(200);
    const thirdPublication = await thirdPublishResponse.json();
    expect(thirdPublication.published_revision).toEqual(
      expect.objectContaining({ revision: 3 }),
    );
    const publicAfterThirdPublish = await fetch(
      editorialUrl(fixture.store.slug, game.slug),
    );
    await expect(publicAfterThirdPublish.json()).resolves.toEqual({
      review: {
        headline: "Third edition",
        body: "Another post-publication draft edit.",
      },
    });

    const revisions = await prisma.storeRevision.findMany({
      where: { store_id: fixture.store.id },
      orderBy: { revision: "asc" },
      select: { revision: true, game_editorials: true },
    });
    expect(revisions).toEqual([
      {
        revision: 1,
        game_editorials: [
          {
            game_id: game.id,
            headline: "First edition",
            body: "The review that belongs to the first publication.",
          },
        ],
      },
      {
        revision: 2,
        game_editorials: [
          {
            game_id: game.id,
            headline: "Second edition",
            body: "The review visible only in preview before republishing.",
          },
        ],
      },
      {
        revision: 3,
        game_editorials: [
          {
            game_id: game.id,
            headline: "Third edition",
            body: "Another post-publication draft edit.",
          },
        ],
      },
    ]);
  });
});
