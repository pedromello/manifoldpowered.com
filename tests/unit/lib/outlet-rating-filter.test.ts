import { OUTLET_RATING_SCALES, ratingValues } from "contracts/outlet-rating";
import {
  EMPTY_OUTLET_RATING_FILTER,
  hasOutletRatingFilter,
  validOutletRatingFilter,
  writeOutletRatingFilter,
  type OutletRatingFilter,
} from "lib/outlet-rating-filter";

describe("Outlet rating URL filters", () => {
  test("absent rating filters allow an unconfigured Outlet", () => {
    expect(hasOutletRatingFilter(EMPTY_OUTLET_RATING_FILTER)).toBe(false);
    expect(validOutletRatingFilter(EMPTY_OUTLET_RATING_FILTER, null)).toBe(
      true,
    );
  });

  test.each(OUTLET_RATING_SCALES)(
    "accepts every native %s value, including zero, in both operators",
    (scale) => {
      for (const value of ratingValues(scale)) {
        for (const operator of ["eq", "gte"]) {
          expect(
            validOutletRatingFilter(
              {
                rating_scale: scale,
                rating_op: operator,
                rating_value: String(value),
              },
              scale,
            ),
          ).toBe(true);
        }
      }
    },
  );

  test("a link to an older scale is never reinterpreted", () => {
    const filter = {
      rating_scale: "STARS",
      rating_op: "eq",
      rating_value: "5",
    };
    expect(validOutletRatingFilter(filter, "NUMERIC_10")).toBe(false);
    expect(validOutletRatingFilter(filter, null)).toBe(false);
  });

  test.each<OutletRatingFilter>([
    { rating_scale: "STARS", rating_op: "eq", rating_value: "5.5" },
    { rating_scale: "STARS", rating_op: "eq", rating_value: "0.25" },
    { rating_scale: "STARS", rating_op: "eq", rating_value: "0x4" },
    { rating_scale: "STARS", rating_op: "eq", rating_value: "4e0" },
    { rating_scale: "STARS", rating_op: "eq", rating_value: " 4" },
    { rating_scale: "STARS", rating_op: "eq", rating_value: "" },
    { rating_scale: "STARS", rating_op: "eq", rating_value: " " },
    { rating_scale: "STARS", rating_op: "eq", rating_value: null },
    { rating_scale: "STARS", rating_op: null, rating_value: "0" },
    { rating_scale: "STARS", rating_op: "lt", rating_value: "4" },
    { rating_scale: null, rating_op: "eq", rating_value: "0" },
  ])("rejects an incomplete or invalid filter %j", (filter) => {
    expect(validOutletRatingFilter(filter, "STARS")).toBe(false);
  });

  test("S+ survives encoding alongside search, categories, tags, sorting, preview and pagination", () => {
    const params = new URLSearchParams(
      "q=space&category=Adventure&tags=Co-op&tags=RPG&order=title_asc&page=2&preview=1",
    );
    const filter = {
      rating_scale: "TIER",
      rating_op: "eq",
      rating_value: "S+",
    };
    writeOutletRatingFilter(params, filter);
    expect(params.toString()).toContain("rating_value=S%2B");
    const parsed = new URLSearchParams(params.toString());
    expect(parsed.get("rating_value")).toBe("S+");
    expect(parsed.getAll("tags")).toEqual(["Co-op", "RPG"]);
    expect(parsed.get("q")).toBe("space");
    expect(parsed.get("category")).toBe("Adventure");
    expect(parsed.get("order")).toBe("title_asc");
    expect(parsed.get("page")).toBe("2");
    expect(parsed.get("preview")).toBe("1");
    writeOutletRatingFilter(params, EMPTY_OUTLET_RATING_FILTER);
    expect(params.toString()).toBe(
      "q=space&category=Adventure&tags=Co-op&tags=RPG&order=title_asc&page=2&preview=1",
    );
  });
});
