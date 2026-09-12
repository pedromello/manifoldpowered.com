import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import { suggestedRatingMapping } from "contracts/outlet-rating";
import {
  editorialRequest,
  ratingFixture,
  ratingSystemRequest,
} from "tests/integration/api/v1/_support/outlet-ratings";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("PUT Outlet rating system", () => {
  test("configures an initial scale with one draft increment", async () => {
    const fixture = await ratingFixture();
    const response = await ratingSystemRequest(
      fixture.outlet.slug,
      fixture.session.token,
      "PUT",
      { target_scale: "STARS", expected_draft_revision: 1 },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rating_scale: "STARS",
      draft_revision: 2,
      converted_count: 0,
    });
    const outlet = await prisma.store.findUniqueOrThrow({
      where: { id: fixture.outlet.id },
    });
    expect(outlet.published_revision_id).toBeNull();
  });

  test("applies the confirmed custom map to hidden reviews and rejects a replay", async () => {
    const fixture = await ratingFixture("NUMERIC_10");
    const game = await orchestrator.createGame(fixture.owner.id);
    await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: game.id,
        body: "Keep this text",
        rating_scale: "NUMERIC_10",
        rating_value: 15,
      },
    });
    await prisma.storeGameOverride.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: game.id,
        visibility: "HIDE",
      },
    });
    const mapping = suggestedRatingMapping("NUMERIC_10", "TIER").map((entry) =>
      entry.from === 7.5 ? { ...entry, to: "A-" as const } : entry,
    );
    const input = { target_scale: "TIER", expected_draft_revision: 1, mapping };
    const response = await ratingSystemRequest(
      fixture.outlet.slug,
      fixture.session.token,
      "PUT",
      input,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rating_scale: "TIER",
      draft_revision: 2,
      converted_count: 1,
    });
    expect(
      await prisma.storeGameEditorial.findFirst({
        where: { store_id: fixture.outlet.id },
      }),
    ).toEqual(
      expect.objectContaining({
        body: "Keep this text",
        rating_scale: "TIER",
        rating_value: 10,
      }),
    );
    expect(
      (
        await ratingSystemRequest(
          fixture.outlet.slug,
          fixture.session.token,
          "PUT",
          input,
        )
      ).status,
    ).toBe(409);
  });

  test("rejects incomplete conversion and stale preview without persisting any part", async () => {
    const fixture = await ratingFixture("STARS");
    const game = await orchestrator.createGame(fixture.owner.id);
    await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: game.id,
        body: "",
        rating_scale: "STARS",
        rating_value: 0,
      },
    });
    const invalid = await ratingSystemRequest(
      fixture.outlet.slug,
      fixture.session.token,
      "PUT",
      {
        target_scale: "TIER",
        expected_draft_revision: 1,
        mapping: [{ from: 0, to: "F" }],
      },
    );
    expect(invalid.status).toBe(400);
    expect(
      (
        await prisma.store.findUniqueOrThrow({
          where: { id: fixture.outlet.id },
        })
      ).rating_scale,
    ).toBe("STARS");
    expect(
      (await prisma.storeGameEditorial.findFirstOrThrow()).rating_value,
    ).toBe(0);
    const edited = await editorialRequest(
      fixture.outlet.slug,
      game.slug,
      fixture.session.token,
      { body: "An edit after preview", expected_draft_revision: 1 },
    );
    expect(edited.status).toBe(200);
    const stale = await ratingSystemRequest(
      fixture.outlet.slug,
      fixture.session.token,
      "PUT",
      {
        target_scale: "TIER",
        expected_draft_revision: 1,
        mapping: suggestedRatingMapping("STARS", "TIER"),
      },
    );
    expect(stale.status).toBe(409);
    expect(
      (await prisma.storeGameEditorial.findFirstOrThrow()).rating_scale,
    ).toBe("STARS");
  });

  test("concurrent conversions leave every rated game in the winning scale, including hidden games", async () => {
    const fixture = await ratingFixture("STARS");
    const gameIds: string[] = [];
    for (const [index, value] of [0, 3, 9, 10].entries()) {
      const game = await orchestrator.createGame(fixture.owner.id);
      gameIds.push(game.id);
      await prisma.storeGameEditorial.create({
        data: {
          store_id: fixture.outlet.id,
          game_id: game.id,
          body: `Original review ${index}`,
          rating_scale: "STARS",
          rating_value: value,
        },
      });
    }
    const unratedGame = await orchestrator.createGame(fixture.owner.id);
    await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: unratedGame.id,
        body: "No rating yet",
      },
    });
    await prisma.storeGameOverride.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: gameIds[2],
        visibility: "HIDE",
      },
    });
    const results = await Promise.all([
      ratingSystemRequest(fixture.outlet.slug, fixture.session.token, "PUT", {
        target_scale: "TIER",
        expected_draft_revision: 1,
        mapping: suggestedRatingMapping("STARS", "TIER"),
      }),
      ratingSystemRequest(fixture.outlet.slug, fixture.session.token, "PUT", {
        target_scale: "NUMERIC_10",
        expected_draft_revision: 1,
        mapping: suggestedRatingMapping("STARS", "NUMERIC_10"),
      }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = await results
      .find((response) => response.status === 200)!
      .json();
    expect(winner).toEqual({
      rating_scale: expect.stringMatching(/^(TIER|NUMERIC_10)$/),
      draft_revision: 2,
      converted_count: 4,
    });
    const outlet = await prisma.store.findUniqueOrThrow({
      where: { id: fixture.outlet.id },
    });
    expect(outlet.draft_revision).toBe(2);
    expect(outlet.rating_scale).toBe(winner.rating_scale);
    const reviews = await prisma.storeGameEditorial.findMany({
      where: { store_id: fixture.outlet.id },
    });
    const expectedValues =
      outlet.rating_scale === "TIER" ? [0, 1, 13, 15] : [0, 6, 18, 20];
    for (const [index, gameId] of gameIds.entries()) {
      expect(reviews.find((review) => review.game_id === gameId)).toEqual(
        expect.objectContaining({
          rating_scale: outlet.rating_scale,
          rating_value: expectedValues[index],
          body: `Original review ${index}`,
        }),
      );
    }
    expect(reviews.find((review) => review.game_id === unratedGame.id)).toEqual(
      expect.objectContaining({
        rating_scale: null,
        rating_value: null,
        body: "No rating yet",
      }),
    );
    expect(
      await prisma.storeGameOverride.findFirst({
        where: { store_id: fixture.outlet.id, game_id: gameIds[2] },
      }),
    ).toEqual(expect.objectContaining({ visibility: "HIDE" }));
  });

  test("rejects anonymous users and unrelated editors", async () => {
    const fixture = await ratingFixture();
    const body = { target_scale: "TIER", expected_draft_revision: 1 };
    expect(
      (await ratingSystemRequest(fixture.outlet.slug, undefined, "PUT", body))
        .status,
    ).toBe(403);
    const outsider = await ratingFixture();
    const response = await ratingSystemRequest(
      fixture.outlet.slug,
      outsider.session.token,
      "PUT",
      body,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message:
        "You do not have permission to change this Outlet's rating system.",
      action: "Ask the Outlet owner for editing access.",
      name: "ForbiddenError",
      status_code: 403,
    });
  });
});
