import {
  registeredStorefrontSlugs,
  resolveStorefront,
} from "storefronts/registry";

describe("storefront registry", () => {
  test("resolves an ordinary Outlet explicitly to the standard experience", () => {
    expect(resolveStorefront({ slug: "outlet-teste-1" })).toEqual({
      kind: "standard",
      themeKey: "platform",
    });
  });

  test("does not turn a near-match into a custom Outlet", () => {
    expect(resolveStorefront({ slug: "strategos-void-preview" }).kind).toBe(
      "standard",
    );
  });

  test.each(["strategos-void", "neon-alley"])(
    "resolves the registered slug %s to its custom experience",
    (slug) => {
      const resolution = resolveStorefront({ slug });

      expect(resolution.kind).toBe("custom");
      expect(resolution.themeKey).toBe(slug);
      if (resolution.kind === "custom") {
        expect(resolution.storefront).toEqual(
          expect.objectContaining({
            Storefront: expect.anything(),
            palette: expect.any(Object),
          }),
        );
      }
    },
  );

  test("keeps custom behavior opt-in through the registry", () => {
    expect(registeredStorefrontSlugs().sort()).toEqual([
      "neon-alley",
      "strategos-void",
    ]);
  });
});
