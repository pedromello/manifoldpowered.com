import { hasExplicitStoreVisualIdentity } from "models/store_revision";

describe("Outlet visual publication readiness", () => {
  test.each(["channel", "editorial", "community"])(
    "accepts the supported %s preset",
    (layout_preset) => {
      expect(
        hasExplicitStoreVisualIdentity({ layout_preset, theme_key: null }),
      ).toBe(true);
    },
  );

  test.each(["neon-alley"])(
    "accepts the registered bespoke theme %s without a preset",
    (theme_key) => {
      expect(
        hasExplicitStoreVisualIdentity({ layout_preset: null, theme_key }),
      ).toBe(true);
    },
  );

  test("requires a standard preset when republishing a retired bespoke theme", () => {
    expect(
      hasExplicitStoreVisualIdentity({
        layout_preset: null,
        theme_key: "strategos-void",
      }),
    ).toBe(false);
    expect(
      hasExplicitStoreVisualIdentity({
        layout_preset: "community",
        theme_key: "strategos-void",
      }),
    ).toBe(true);
  });

  test("rejects classic null and unregistered theme values for a new publication", () => {
    expect(
      hasExplicitStoreVisualIdentity({
        layout_preset: null,
        theme_key: "forged-theme",
      }),
    ).toBe(false);
    expect(
      hasExplicitStoreVisualIdentity({ layout_preset: null, theme_key: null }),
    ).toBe(false);
  });
});
