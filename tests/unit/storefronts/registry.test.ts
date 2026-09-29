import {
  registeredStorefrontSlugs,
  resolveStorefront,
} from "storefronts/registry";

describe("storefront registry", () => {
  test("resolves an ordinary Outlet explicitly to the standard experience", () => {
    expect(
      resolveStorefront({ slug: "outlet-teste-1", theme_key: null }),
    ).toEqual({
      kind: "standard",
      themeKey: "platform",
    });
  });

  test("does not let a slug impersonate a bespoke Outlet", () => {
    expect(
      resolveStorefront({ slug: "strategos-void", theme_key: null }).kind,
    ).toBe("standard");
  });

  test.each(["strategos-void", "neon-alley"])(
    "resolves the registered theme key %s to its custom experience",
    (themeKey) => {
      const resolution = resolveStorefront({
        slug: `renamed-${themeKey}`,
        theme_key: themeKey,
      });

      expect(resolution.kind).toBe("custom");
      expect(resolution.themeKey).toBe(themeKey);
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

  test("fails closed for an unknown theme key", () => {
    expect(
      resolveStorefront({
        slug: "ordinary-outlet",
        theme_key: "not-registered",
      }),
    ).toEqual({ kind: "standard", themeKey: "platform" });
  });

  test("keeps custom behavior opt-in through the registry", () => {
    expect(registeredStorefrontSlugs().sort()).toEqual([
      "neon-alley",
      "strategos-void",
    ]);
  });
});
