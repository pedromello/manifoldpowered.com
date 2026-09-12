import { randomUUID } from "node:crypto";
import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import type { OutletRatingScale } from "contracts/outlet-rating";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

// Raw inserts deliberately bypass model and Prisma input validation: these
// tests exercise the PostgreSQL constraints. References are logical by design.
function insertEditorial(
  scale: OutletRatingScale | null,
  value: number | null,
  body = "Review text",
) {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "store_game_editorials"
      ("id", "store_id", "game_id", "body", "rating_scale", "rating_value", "updated_at")
    VALUES (${randomUUID()}, ${randomUUID()}, ${randomUUID()}, ${body},
      ${scale}::"OutletRatingScale", ${value}, CURRENT_TIMESTAMP)
  `);
}

function insertProjection(
  scale: OutletRatingScale | null,
  value: number | null,
  revisionId = randomUUID(),
  gameId = randomUUID(),
) {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "store_revision_game_ratings"
      ("id", "revision_id", "game_id", "rating_scale", "rating_value")
    VALUES (${randomUUID()}, ${revisionId}, ${gameId}, ${scale}::"OutletRatingScale", ${value})
  `);
}

const validBoundaries: Array<[OutletRatingScale, number]> = [
  ["STARS", 0],
  ["STARS", 10],
  ["NUMERIC_10", 0],
  ["NUMERIC_10", 20],
  ["TIER", 0],
  ["TIER", 15],
];
const invalidBoundaries: Array<[OutletRatingScale, number]> = [
  ["STARS", -1],
  ["STARS", 11],
  ["NUMERIC_10", -1],
  ["NUMERIC_10", 21],
  ["TIER", -1],
  ["TIER", 16],
];
const partialRatingPairs: Array<[OutletRatingScale | null, number | null]> = [
  [null, 0],
  ["STARS", null],
  ["NUMERIC_10", null],
  ["TIER", null],
];

describe("Outlet rating PostgreSQL constraints", () => {
  test.each(validBoundaries)(
    "allows a note-only %s rating at native boundary %i",
    async (scale, value) => {
      await expect(insertEditorial(scale, value, "")).resolves.toBe(1);
      await expect(insertProjection(scale, value)).resolves.toBe(1);
    },
  );

  test("allows a text-only editorial with the entire rating pair absent", async () => {
    await expect(insertEditorial(null, null)).resolves.toBe(1);
    expect(await prisma.storeGameEditorial.findFirstOrThrow()).toEqual(
      expect.objectContaining({
        rating_scale: null,
        rating_value: null,
        body: "Review text",
      }),
    );
  });

  test.each(partialRatingPairs)(
    "rejects a partial editorial rating pair %s/%s even with text",
    async (scale, value) => {
      await expect(insertEditorial(scale, value)).rejects.toThrow(
        "store_game_editorials_rating_check",
      );
      expect(await prisma.storeGameEditorial.count()).toBe(0);
    },
  );

  test.each(invalidBoundaries)(
    "rejects out-of-range %s ordinal %i in draft and published ratings",
    async (scale, value) => {
      await expect(insertEditorial(scale, value)).rejects.toThrow(
        "store_game_editorials_rating_check",
      );
      await expect(insertProjection(scale, value)).rejects.toThrow(
        "store_revision_game_ratings_value_check",
      );
      expect(await prisma.storeGameEditorial.count()).toBe(0);
      expect(await prisma.storeRevisionGameRating.count()).toBe(0);
    },
  );

  test.each(["", "   "])(
    "rejects editorial content %j when no rating exists",
    async (body) => {
      await expect(insertEditorial(null, null, body)).rejects.toThrow(
        "store_game_editorials_content_check",
      );
      expect(await prisma.storeGameEditorial.count()).toBe(0);
    },
  );

  test("does not allow a missing scale to bypass the empty-content constraint", async () => {
    await expect(insertEditorial(null, 0, "")).rejects.toThrow(
      "store_game_editorials_rating_check",
    );
    expect(await prisma.storeGameEditorial.count()).toBe(0);
  });

  test("requires both native rating columns on a published projection", async () => {
    await expect(insertProjection(null, 0)).rejects.toThrow("rating_scale");
    await expect(insertProjection("TIER", null)).rejects.toThrow(
      "rating_value",
    );
    expect(await prisma.storeRevisionGameRating.count()).toBe(0);
  });

  test("allows only one rating for a game in the same revision", async () => {
    const revisionId = randomUUID();
    const gameId = randomUUID();
    await expect(
      insertProjection("STARS", 0, revisionId, gameId),
    ).resolves.toBe(1);
    await expect(
      insertProjection("STARS", 10, revisionId, gameId),
    ).rejects.toThrow("store_revision_game_ratings_revision_id_game_id_key");
    await expect(
      insertProjection("STARS", 10, randomUUID(), gameId),
    ).resolves.toBe(1);
    expect(await prisma.storeRevisionGameRating.count()).toBe(2);
  });
});
