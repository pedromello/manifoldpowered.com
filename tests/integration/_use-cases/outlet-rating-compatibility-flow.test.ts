import { prisma } from "infra/database";
import webserver from "infra/webserver";
import type { OutletRating } from "contracts/outlet-rating";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createReadyDraft,
  type ReadyDraftFixture,
} from "tests/integration/api/v1/_support/outlet-lifecycle";
import {
  editorialRequest,
  ratingSystemRequest,
} from "tests/integration/api/v1/_support/outlet-ratings";

type Review = {
  headline: string | null;
  body: string;
  rating: OutletRating | null;
};

type CatalogResponse = {
  games: Array<{ id: string; outlet_review: Review | null }>;
  pagination: { page: number; limit: number; total: number; pages: number };
  rating_scale?: string | null;
};

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

function outletUrl(fixture: ReadyDraftFixture, path = "") {
  return `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}${path}`;
}

async function readCatalog(
  fixture: ReadyDraftFixture,
  path: string,
  authenticated = false,
): Promise<CatalogResponse> {
  const response = await fetch(
    outletUrl(fixture, path),
    authenticated
      ? { headers: authenticatedJsonHeaders(fixture.sessionToken) }
      : undefined,
  );
  expect(response.status).toBe(200);
  return response.json();
}

describe("Outlet rating compatibility across public and management APIs", () => {
  test("reads a legacy snapshot without inventing draft ratings or rewriting historical data", async () => {
    const fixture = await createReadyDraft("Legacy Rating Snapshot");
    const reviewedGame = fixture.games[0];
    const legacyEditorial = {
      game_id: reviewedGame.id,
      headline: "Original review",
      body: "Published before Outlet ratings existed.",
    };
    await prisma.storeGameEditorial.create({
      data: { store_id: fixture.store.id, ...legacyEditorial },
    });
    await orchestrator.publishStore(fixture.store.id, fixture.user.id);

    const publishedStore = await prisma.store.findUniqueOrThrow({
      where: { id: fixture.store.id },
    });
    // Emulate the exact pre-migration JSON: the rating property did not exist.
    const historicalRevision = await prisma.storeRevision.update({
      where: { id: publishedStore.published_revision_id! },
      data: { rating_scale: null, game_editorials: [legacyEditorial] },
    });

    const configured = await ratingSystemRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "PUT",
      {
        target_scale: "STARS",
        expected_draft_revision: fixture.store.draft_revision,
      },
    );
    expect(configured.status).toBe(200);
    expect(await configured.json()).toEqual({
      rating_scale: "STARS",
      draft_revision: fixture.store.draft_revision + 1,
      converted_count: 0,
    });
    const draftReview: Review = {
      headline: "New draft review",
      body: "This rating belongs only to the next edition.",
      rating: { scale: "STARS", value: 4.5 },
    };
    const edited = await editorialRequest(
      fixture.store.slug,
      reviewedGame.slug,
      fixture.sessionToken,
      {
        ...draftReview,
        expected_draft_revision: fixture.store.draft_revision + 1,
      },
    );
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({
      review: draftReview,
      draft_revision: fixture.store.draft_revision + 2,
    });

    const publicReview: Review = {
      headline: legacyEditorial.headline,
      body: legacyEditorial.body,
      rating: null,
    };
    const publicStore = await fetch(outletUrl(fixture));
    expect(publicStore.status).toBe(200);
    expect((await publicStore.json()).rating_scale).toBeNull();

    for (const path of ["/search", "/featured"]) {
      const catalog = await readCatalog(fixture, path);
      expect(
        catalog.games.find(({ id }) => id === reviewedGame.id)?.outlet_review,
      ).toEqual(publicReview);
    }
    const detailPath = `/game-editorials/${reviewedGame.slug}`;
    const publicDetail = await fetch(outletUrl(fixture, detailPath));
    expect(publicDetail.status).toBe(200);
    expect(await publicDetail.json()).toEqual({ review: publicReview });

    const previewDetail = await fetch(
      outletUrl(fixture, `${detailPath}?preview=1`),
      { headers: authenticatedJsonHeaders(fixture.sessionToken) },
    );
    expect(previewDetail.status).toBe(200);
    expect(previewDetail.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(await previewDetail.json()).toEqual({ review: draftReview });
    const management = await readCatalog(fixture, "/curation-catalog", true);
    expect(management.rating_scale).toBe("STARS");
    expect(
      management.games.find(({ id }) => id === reviewedGame.id)?.outlet_review,
    ).toEqual(draftReview);
    const preview = await readCatalog(fixture, "/search?preview=1", true);
    expect(
      preview.games.find(({ id }) => id === reviewedGame.id)?.outlet_review,
    ).toEqual(draftReview);

    expect(
      await prisma.storeRevision.findUniqueOrThrow({
        where: { id: historicalRevision.id },
      }),
    ).toEqual(historicalRevision);
    expect(
      await prisma.storeRevisionGameRating.count({
        where: { revision_id: historicalRevision.id },
      }),
    ).toBe(0);
  });

  test("filters published stars by exact zero and minimum half point while keeping unrated reviews separate", async () => {
    const fixture = await createReadyDraft("Published Star Filters");
    await prisma.store.update({
      where: { id: fixture.store.id },
      data: { rating_scale: "STARS" },
    });
    const nativeValues = [0, 8, 9, 10];
    await prisma.storeGameEditorial.createMany({
      data: fixture.games.slice(0, 4).map((game, index) => ({
        store_id: fixture.store.id,
        game_id: game.id,
        body: "",
        rating_scale: "STARS",
        rating_value: nativeValues[index],
      })),
    });
    await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.store.id,
        game_id: fixture.games[4].id,
        body: "A review without a rating.",
      },
    });
    await orchestrator.publishStore(fixture.store.id, fixture.user.id);

    const zero = await readCatalog(
      fixture,
      "/search?rating_scale=STARS&rating_op=eq&rating_value=0",
    );
    expect(zero.games.map(({ id }) => id)).toEqual([fixture.games[0].id]);
    expect(zero.pagination.total).toBe(1);
    expect(zero.games[0].outlet_review).toEqual({
      headline: null,
      body: "",
      rating: { scale: "STARS", value: 0 },
    });

    const minimum = await readCatalog(
      fixture,
      "/search?rating_scale=STARS&rating_op=gte&rating_value=4.5&order=title_asc&limit=1",
    );
    expect(minimum.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      pages: 2,
    });
    expect(minimum.games.map(({ id }) => id)).toEqual([fixture.games[2].id]);
    expect(minimum.games[0].outlet_review).toEqual({
      headline: null,
      body: "",
      rating: { scale: "STARS", value: 4.5 },
    });
    const secondPage = await readCatalog(
      fixture,
      "/search?rating_scale=STARS&rating_op=gte&rating_value=4.5&order=title_asc&limit=1&page=2",
    );
    expect(secondPage.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      pages: 2,
    });
    expect(secondPage.games.map(({ id }) => id)).toEqual([fixture.games[3].id]);
    expect(secondPage.games[0].outlet_review?.rating).toEqual({
      scale: "STARS",
      value: 5,
    });

    const allRated = await readCatalog(
      fixture,
      "/search?rating_scale=STARS&rating_op=gte&rating_value=0&order=title_asc",
    );
    expect(allRated.games.map(({ id }) => id)).toEqual(
      fixture.games.slice(0, 4).map(({ id }) => id),
    );
    expect(allRated.pagination.total).toBe(4);
    const unfiltered = await readCatalog(fixture, "/search?order=title_asc");
    expect(unfiltered.pagination.total).toBe(6);
    expect(unfiltered.games[4].outlet_review).toEqual({
      headline: null,
      body: "A review without a rating.",
      rating: null,
    });
    expect(unfiltered.games[5].outlet_review).toBeNull();

    const detail = await fetch(
      outletUrl(fixture, `/game-editorials/${fixture.games[2].slug}`),
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({
      review: {
        headline: null,
        body: "",
        rating: { scale: "STARS", value: 4.5 },
      },
    });
  });

  test("the generic Outlet PATCH cannot bypass rating conversion or mutate part of the draft", async () => {
    const fixture = await createReadyDraft("Rating Conversion Bypass");
    const beforeStore = await prisma.store.update({
      where: { id: fixture.store.id },
      data: { rating_scale: "NUMERIC_10" },
    });
    const beforeReview = await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.store.id,
        game_id: fixture.games[0].id,
        body: "Preserve this review.",
        rating_scale: "NUMERIC_10",
        rating_value: 17,
      },
    });
    const response = await fetch(outletUrl(fixture), {
      method: "PATCH",
      headers: {
        ...authenticatedJsonHeaders(fixture.sessionToken),
        "If-Match": `"${beforeStore.draft_revision}"`,
      },
      body: JSON.stringify({
        name: "A partial update must also be rejected",
        rating_scale: "TIER",
      }),
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.name).toBe("ValidationError");
    expect(error.message).toBe("One or more fields are invalid");
    expect(error.action).toBe("Check the fields and try again");
    expect(error.status_code).toBe(400);
    expect(error.context).toEqual([
      {
        code: "unrecognized_keys",
        keys: ["rating_scale"],
        path: [],
        message: 'Unrecognized key: "rating_scale"',
      },
    ]);
    expect(
      await prisma.store.findUniqueOrThrow({
        where: { id: fixture.store.id },
      }),
    ).toEqual(beforeStore);
    expect(
      await prisma.storeGameEditorial.findUniqueOrThrow({
        where: { id: beforeReview.id },
      }),
    ).toEqual(beforeReview);
  });
});
