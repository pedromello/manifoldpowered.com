import { prisma } from "infra/database";
import webserver from "infra/webserver";
import {
  suggestedRatingMapping,
  type OutletRating,
} from "contracts/outlet-rating";
import {
  getReadyDraftSnapshot,
  createStoreRevision,
} from "models/store_revision";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createReadyDraft,
  publicationRequest,
  type ReadyDraftFixture,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function ratedFixture(scale: "NUMERIC_10" | "TIER" = "NUMERIC_10") {
  const fixture = await createReadyDraft("Rating Publication");
  await prisma.store.update({
    where: { id: fixture.store.id },
    data: { rating_scale: scale },
  });
  const values = scale === "TIER" ? [14, 15, 10, 9, 0] : [0, 14, 15, 15, 20];
  await prisma.storeGameEditorial.createMany({
    data: fixture.games.slice(0, 5).map((game, index) => ({
      store_id: fixture.store.id,
      game_id: game.id,
      headline: null,
      body: index === 0 ? "" : "Editorial opinion.",
      rating_scale: scale,
      rating_value: values[index],
    })),
  });
  return fixture;
}

async function publish(
  fixture: ReadyDraftFixture,
  revision = fixture.store.draft_revision,
) {
  const response = await publicationRequest(
    fixture.store.slug,
    fixture.sessionToken,
    "publish",
    revision,
  );
  expect(response.status).toBe(200);
  return response.json();
}

type SearchGame = {
  id: string;
  outlet_review: { body: string; rating: OutletRating | null } | null;
};
async function search(
  fixture: ReadyDraftFixture,
  query: Record<string, string> = {},
  preview = false,
) {
  const url = new URL(
    `/api/v1/stores/${fixture.store.slug}/search`,
    webserver.getOrigin(),
  );
  Object.entries(query).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  if (preview) url.searchParams.set("preview", "1");
  const response = await fetch(
    url,
    preview
      ? { headers: authenticatedJsonHeaders(fixture.sessionToken) }
      : undefined,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  return body as {
    games: SearchGame[];
    pagination: { total: number; pages: number };
  };
}

describe("Published Outlet ratings", () => {
  test("filters the published ratings before pagination while draft edits remain private", async () => {
    const fixture = await ratedFixture();
    const first = await publish(fixture);
    const filter = {
      rating_scale: "NUMERIC_10",
      rating_op: "gte",
      rating_value: "7.5",
      limit: "1",
    };
    const firstPage = await search(fixture, filter);
    const secondPage = await search(fixture, { ...filter, page: "2" });
    expect(firstPage.pagination).toEqual(
      expect.objectContaining({ total: 3, pages: 3 }),
    );
    expect(firstPage.games).toHaveLength(1);
    expect(secondPage.games).toHaveLength(1);
    expect(secondPage.games[0].id).not.toBe(firstPage.games[0].id);
    expect(firstPage.games[0].outlet_review!.rating).toEqual(
      expect.objectContaining({ scale: "NUMERIC_10" }),
    );
    expect(
      (
        await search(fixture, {
          ...filter,
          tags: "lifecycle-blocked",
          limit: "20",
        })
      ).games.map(({ id }) => id),
    ).toEqual([fixture.games[4].id]);
    expect(
      (
        await search(fixture, { ...filter, q: fixture.games[2].title })
      ).games.map(({ id }) => id),
    ).toEqual([fixture.games[2].id]);

    const zeroFilter = {
      rating_scale: "NUMERIC_10",
      rating_op: "eq",
      rating_value: "0",
    };
    expect(
      (await search(fixture, zeroFilter)).games.map(({ id }) => id),
    ).toEqual([fixture.games[0].id]);
    expect((await search(fixture)).pagination.total).toBe(6);

    const update = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/game-editorials/${fixture.games[0].slug}`,
      {
        method: "PUT",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          body: "",
          rating: { scale: "NUMERIC_10", value: 10 },
          expected_draft_revision: fixture.store.draft_revision,
        }),
      },
    );
    expect(update.status).toBe(200);
    const updated = await update.json();
    expect((await search(fixture, zeroFilter)).games).toHaveLength(1);
    expect((await search(fixture, zeroFilter, true)).games).toHaveLength(0);
    const unauthorizedPreview = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/search?preview=1`,
    );
    expect(unauthorizedPreview.status).toBe(404);

    const featured = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/featured`,
    );
    expect(featured.status).toBe(200);
    expect(
      (await featured.json()).games.find(
        (game: SearchGame) => game.id === fixture.games[0].id,
      ).outlet_review.rating,
    ).toEqual({ scale: "NUMERIC_10", value: 0 });
    const second = await publish(fixture, updated.draft_revision);
    expect((await search(fixture, zeroFilter)).games).toHaveLength(0);
    expect(
      (await search(fixture, { ...filter, limit: "20" })).pagination.total,
    ).toBe(4);
    expect(
      await prisma.storeRevisionGameRating.count({
        where: { revision_id: first.published_revision.id },
      }),
    ).toBe(5);
    expect(
      await prisma.storeRevisionGameRating.findUnique({
        where: {
          revision_id_game_id: {
            revision_id: first.published_revision.id,
            game_id: fixture.games[0].id,
          },
        },
      }),
    ).toEqual(expect.objectContaining({ rating_value: 0 }));
    expect(
      await prisma.storeRevisionGameRating.findUnique({
        where: {
          revision_id_game_id: {
            revision_id: second.published_revision.id,
            game_id: fixture.games[0].id,
          },
        },
      }),
    ).toEqual(expect.objectContaining({ rating_value: 20 }));
  });

  test("keeps distinct tiers even when conversion anchors coincide", async () => {
    const fixture = await ratedFixture("TIER");
    await publish(fixture);
    const filter = { rating_scale: "TIER", rating_op: "eq", rating_value: "S" };
    expect((await search(fixture, filter)).games.map(({ id }) => id)).toEqual([
      fixture.games[0].id,
    ]);
    expect(
      (await search(fixture, { ...filter, rating_value: "S+" })).games.map(
        ({ id }) => id,
      ),
    ).toEqual([fixture.games[1].id]);
    expect(
      new Set(
        (await search(fixture, { ...filter, rating_op: "gte" })).games.map(
          ({ id }) => id,
        ),
      ),
    ).toEqual(new Set(fixture.games.slice(0, 2).map(({ id }) => id)));
    expect(
      (await search(fixture, { ...filter, rating_value: "A-" })).games.map(
        ({ id }) => id,
      ),
    ).toEqual([fixture.games[2].id]);
    expect(
      (await search(fixture, { ...filter, rating_value: "B+" })).games.map(
        ({ id }) => id,
      ),
    ).toEqual([fixture.games[3].id]);
    expect(
      (await search(fixture, { ...filter, rating_value: "F" })).games.map(
        ({ id }) => id,
      ),
    ).toEqual([fixture.games[4].id]);
    expect(
      (await search(fixture, { ...filter, rating_value: "D" })).pagination
        .total,
    ).toBe(0);
  });

  test("publishes a converted scale together with its badges and filter projection", async () => {
    const fixture = await ratedFixture("TIER");
    await publish(fixture);
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/rating-system`,
      {
        method: "PUT",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({
          target_scale: "NUMERIC_10",
          expected_draft_revision: fixture.store.draft_revision,
          mapping: suggestedRatingMapping("TIER", "NUMERIC_10"),
        }),
      },
    );
    expect(response.status).toBe(200);
    const converted = await response.json();
    const storeUrl = `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`;
    expect((await (await fetch(storeUrl)).json()).rating_scale).toBe("TIER");
    expect(
      (
        await search(fixture, {
          rating_scale: "TIER",
          rating_op: "eq",
          rating_value: "A-",
        })
      ).games,
    ).toHaveLength(1);
    expect(
      (
        await search(
          fixture,
          { rating_scale: "NUMERIC_10", rating_op: "eq", rating_value: "7.5" },
          true,
        )
      ).games,
    ).toHaveLength(2);
    await publish(fixture, converted.draft_revision);
    expect((await (await fetch(storeUrl)).json()).rating_scale).toBe(
      "NUMERIC_10",
    );
    expect(
      (
        await search(fixture, {
          rating_scale: "NUMERIC_10",
          rating_op: "eq",
          rating_value: "7.5",
        })
      ).games,
    ).toHaveLength(2);
    const stale = await fetch(
      `${storeUrl}/search?rating_scale=TIER&rating_op=eq&rating_value=S`,
    );
    expect(stale.status).toBe(400);
    expect((await stale.json()).context.code).toBe("RATING_SCALE_MISMATCH");
  });

  test("rolls back the rating projection when the publication transaction fails", async () => {
    const fixture = await ratedFixture();
    await expect(
      prisma.$transaction(async (transaction) => {
        const { draft } = await getReadyDraftSnapshot(
          fixture.store.id,
          transaction,
        );
        await createStoreRevision({
          draft: draft!,
          actorUserId: fixture.user.id,
          client: transaction,
        });
        throw new Error("Simulated publication interruption");
      }),
    ).rejects.toThrow("Simulated publication interruption");
    expect(
      await prisma.storeRevision.count({
        where: { store_id: fixture.store.id },
      }),
    ).toBe(0);
    expect(await prisma.storeRevisionGameRating.count()).toBe(0);
  });

  test("rejects incomplete, repeated, or invalid rating query values", async () => {
    const fixture = await ratedFixture();
    await publish(fixture);
    for (const query of [
      "rating_scale=STARS",
      "rating_scale=NUMERIC_10&rating_op=eq",
      "rating_scale=NUMERIC_10&rating_op=eq&rating_value=1.25",
      "rating_scale=NUMERIC_10&rating_op=eq&rating_value=11",
      "rating_scale=NUMERIC_10&rating_op=eq&rating_value=0&rating_value=10",
      "rating_scale=TIER&rating_op=eq&rating_value=E",
      "rating_scale=NUMERIC_10&rating_op=invalid&rating_value=1",
    ]) {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/search?${query}`,
      );
      expect(response.status).toBe(400);
      expect((await response.json()).name).toBe("ValidationError");
    }
  });
});
