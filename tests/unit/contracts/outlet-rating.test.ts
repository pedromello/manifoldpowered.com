import {
  OUTLET_RATING_SCALES,
  convertOutletRating,
  formatOutletRating,
  outletRatingSchema,
  ratingFromStorage,
  ratingToStorage,
  ratingValues,
  suggestedRatingMapping,
  validateRatingMapping,
} from "contracts/outlet-rating";

describe("Outlet native ratings", () => {
  test("every value round trips through native storage, including zero and F", () => {
    for (const scale of OUTLET_RATING_SCALES) {
      for (const value of ratingValues(scale)) {
        const rating = outletRatingSchema.parse({ scale, value });
        expect(ratingFromStorage(ratingToStorage(rating))).toEqual(rating);
      }
    }
    expect(ratingFromStorage({})).toBeNull();
    expect(ratingFromStorage(ratingToStorage(null))).toBeNull();
    expect(ratingToStorage({ scale: "STARS", value: 4.5 }).rating_value).toBe(
      9,
    );
    expect(
      ratingToStorage({ scale: "TIER", value: "A-" }).rating_value,
    ).toBeGreaterThan(
      ratingToStorage({ scale: "TIER", value: "B+" }).rating_value,
    );
  });

  test.each([
    { scale: "STARS", value: -0.5 },
    { scale: "STARS", value: 5.5 },
    { scale: "STARS", value: 0.25 },
    { scale: "NUMERIC_10", value: 10.5 },
    { scale: "NUMERIC_10", value: "7.5" },
    { scale: "TIER", value: "E" },
  ])("rejects invalid native input %j", (input) => {
    expect(outletRatingSchema.safeParse(input).success).toBe(false);
  });

  test("suggests all six direct conversion directions", () => {
    expect(
      convertOutletRating({ scale: "STARS", value: 4.5 }, "NUMERIC_10"),
    ).toEqual({ scale: "NUMERIC_10", value: 9 });
    expect(
      convertOutletRating({ scale: "NUMERIC_10", value: 9.5 }, "STARS"),
    ).toEqual({ scale: "STARS", value: 5 });
    expect(convertOutletRating({ scale: "STARS", value: 3.5 }, "TIER")).toEqual(
      { scale: "TIER", value: "B" },
    );
    expect(
      convertOutletRating({ scale: "NUMERIC_10", value: 7.5 }, "TIER"),
    ).toEqual({ scale: "TIER", value: "B+" });
    expect(
      convertOutletRating({ scale: "TIER", value: "B" }, "NUMERIC_10"),
    ).toEqual({ scale: "NUMERIC_10", value: 7 });
    expect(convertOutletRating({ scale: "TIER", value: "S" }, "STARS")).toEqual(
      { scale: "STARS", value: 5 },
    );
  });

  test("ties choose the lower tier and preserve the approved repeated anchor", () => {
    expect(
      convertOutletRating({ scale: "NUMERIC_10", value: 6 }, "TIER").value,
    ).toBe("C+");
    expect(
      convertOutletRating({ scale: "NUMERIC_10", value: 1.5 }, "TIER").value,
    ).toBe("F");
    expect(
      convertOutletRating({ scale: "TIER", value: "A-" }, "NUMERIC_10").value,
    ).toBe(7.5);
    expect(
      convertOutletRating({ scale: "TIER", value: "B+" }, "NUMERIC_10").value,
    ).toBe(7.5);
  });

  test("edited maps may merge values but cannot omit, repeat or mistype source values", () => {
    const mapping = suggestedRatingMapping("STARS", "TIER");
    const merged = mapping.map((entry) => ({ ...entry, to: "S" as const }));
    expect(validateRatingMapping("STARS", "TIER", merged)).toEqual(merged);
    expect(() =>
      validateRatingMapping("STARS", "TIER", mapping.slice(1)),
    ).toThrow();
    expect(() =>
      validateRatingMapping("STARS", "TIER", [
        mapping[0],
        ...mapping.slice(0, -1),
      ]),
    ).toThrow();
    expect(() =>
      validateRatingMapping("STARS", "TIER", [
        { from: 0, to: 1 },
        ...mapping.slice(1),
      ]),
    ).toThrow();
  });

  test("formats native values in the visitor locale", () => {
    expect(formatOutletRating({ scale: "STARS", value: 4.5 }, "pt-BR")).toBe(
      "4,5/5 ★",
    );
    expect(formatOutletRating({ scale: "NUMERIC_10", value: 0 })).toBe("0/10");
    expect(formatOutletRating({ scale: "TIER", value: "S-" })).toBe("S-");
  });
});
