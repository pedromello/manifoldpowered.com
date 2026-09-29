import {
  assertCreatorSelectionInitializationSafe,
  creatorSelectionSchema,
} from "models/store_curation";

describe("creator onboarding curation contract", () => {
  test("requires the exact draft revision for a guided selection", () => {
    expect(
      creatorSelectionSchema.safeParse({
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: ["one", "two", "three", "four", "five"],
      }).success,
    ).toBe(false);

    expect(
      creatorSelectionSchema.safeParse({
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: ["one", "two", "three", "four", "five"],
        expected_draft_revision: 7,
      }).success,
    ).toBe(true);
  });

  test.each([
    {
      catalogMode: "SELECTED" as const,
      tagFilterCount: 0,
      gameOverrideCount: 0,
    },
    {
      catalogMode: "UNDECIDED" as const,
      tagFilterCount: 1,
      gameOverrideCount: 0,
    },
    {
      catalogMode: "UNDECIDED" as const,
      tagFilterCount: 0,
      gameOverrideCount: 1,
    },
  ])("fails closed instead of replacing existing curation", (state) => {
    expect(() => assertCreatorSelectionInitializationSafe(state)).toThrow(
      "onboarding cannot replace safely",
    );
  });

  test("allows initialization only for a pristine undecided catalog", () => {
    expect(() =>
      assertCreatorSelectionInitializationSafe({
        catalogMode: "UNDECIDED",
        tagFilterCount: 0,
        gameOverrideCount: 0,
      }),
    ).not.toThrow();
  });
});
