import { itemHref, storeSlugFromQuery, withStore } from "lib/store-context";

describe("Outlet URL context", () => {
  test("builds an attributed item link", () => {
    expect(itemHref("signal-garden", "careful-curator")).toBe(
      "/item/signal-garden?store=careful-curator",
    );
  });

  test("propagates attribution and authorized preview together", () => {
    expect(itemHref("signal-garden", "careful-curator", true)).toBe(
      "/item/signal-garden?store=careful-curator&preview=1",
    );
  });

  test("preserves existing query parameters and hashes", () => {
    expect(
      withStore("/store/careful-curator?sort=new#catalog", null, true),
    ).toBe("/store/careful-curator?sort=new&preview=1#catalog");
  });

  test("accepts only a scalar, non-empty store query value", () => {
    expect(storeSlugFromQuery({ store: "careful-curator" })).toBe(
      "careful-curator",
    );
    expect(storeSlugFromQuery({ store: ["first", "second"] })).toBeUndefined();
    expect(storeSlugFromQuery({ store: "" })).toBeUndefined();
  });
});
