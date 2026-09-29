import {
  storeGameEditorialDeleteSchema,
  storeGameEditorialInputSchema,
} from "models/store_game_editorial";

describe("Outlet game editorial input", () => {
  test("normalizes optional headlines and trims creator copy", () => {
    expect(
      storeGameEditorialInputSchema.parse({
        headline: "  ",
        body: "  A specific creator point of view.  ",
        expected_draft_revision: 3,
      }),
    ).toEqual({
      headline: null,
      body: "A specific creator point of view.",
      expected_draft_revision: 3,
    });
  });

  test("rejects empty and oversized reviews", () => {
    expect(
      storeGameEditorialInputSchema.safeParse({
        body: " ",
        expected_draft_revision: 1,
      }).success,
    ).toBe(false);
    expect(
      storeGameEditorialInputSchema.safeParse({
        body: "x".repeat(2001),
        expected_draft_revision: 1,
      }).success,
    ).toBe(false);
  });

  test("requires optimistic concurrency for deletion", () => {
    expect(storeGameEditorialDeleteSchema.safeParse({}).success).toBe(false);
    expect(
      storeGameEditorialDeleteSchema.safeParse({
        expected_draft_revision: 4,
      }).success,
    ).toBe(true);
  });
});
