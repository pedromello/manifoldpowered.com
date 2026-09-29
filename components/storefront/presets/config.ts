import {
  DEFAULT_STORE_BRAND_TOKENS,
  DEFAULT_STORE_LAYOUT_PRESET,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_SHAPES,
  STORE_TYPOGRAPHIES,
  type StoreBrandTokens,
  type StoreLayoutPreset,
} from "contracts/store-presentation";
import type { StorefrontPalette } from "components/storefront/palette";
import type { StoreContext } from "components/storefront/types";

export type OutletPresetDefinition = {
  id: StoreLayoutPreset;
  label: string;
  description: string;
};

/**
 * Presets describe information architecture, not a colour variation. Their
 * labels are intentionally data rather than JSX so the management preview can
 * consume the same allowlist without importing the public storefront view.
 */
export const OUTLET_PRESET_DEFINITIONS: Record<
  StoreLayoutPreset,
  OutletPresetDefinition
> = {
  channel: {
    id: "channel",
    label: "Channel",
    description:
      "A cover-led introduction, primary recommendation, and browsable card grid.",
  },
  editorial: {
    id: "editorial",
    label: "Editorial",
    description:
      "A publication masthead, lead story, and numbered reading list.",
  },
  community: {
    id: "community",
    label: "Community",
    description: "A club profile, member picks, and welcoming discovery grid.",
  },
};

export type OutletPaletteDefinition = StorefrontPalette & {
  id: StoreBrandTokens["palette"];
};

/**
 * Every colour is authored here and is safe to interpolate into the
 * StorefrontShell palette. No persisted value ever becomes CSS. Foreground,
 * muted and accent pairs meet WCAG AA against their intended backgrounds.
 */
export const OUTLET_PALETTES: Record<
  StoreBrandTokens["palette"],
  OutletPaletteDefinition
> = {
  manifold: {
    id: "manifold",
    bg: "#0B0812",
    surface: "#17121F",
    border: "#3C3348",
    fg: "#FFFFFF",
    muted: "#BEB5C9",
    accent: "#C4B5FD",
    accentFg: "#0B0812",
  },
  ember: {
    id: "ember",
    bg: "#100B09",
    surface: "#211612",
    border: "#554037",
    fg: "#FFFDFC",
    muted: "#D4BDB3",
    accent: "#FB923C",
    accentFg: "#100B09",
  },
  ocean: {
    id: "ocean",
    bg: "#071014",
    surface: "#0D222A",
    border: "#31505B",
    fg: "#F7FCFD",
    muted: "#ADCAD2",
    accent: "#22D3EE",
    accentFg: "#071014",
  },
};

export const OUTLET_TYPOGRAPHY_CLASSES: Record<
  StoreBrandTokens["typography"],
  { body: string; heading: string; eyebrow: string }
> = {
  modern: {
    body: "font-sans",
    heading: "font-sans font-black tracking-[-0.03em]",
    eyebrow: "font-sans font-black uppercase tracking-[0.18em]",
  },
  editorial: {
    body: "font-serif",
    heading: "font-serif font-bold tracking-[-0.025em]",
    eyebrow: "font-sans font-bold uppercase tracking-[0.2em]",
  },
  rounded: {
    body: "font-sans",
    heading: "font-sans font-extrabold tracking-[-0.02em]",
    eyebrow: "font-sans font-extrabold uppercase tracking-[0.14em]",
  },
};

export const OUTLET_SHAPE_CLASSES: Record<
  StoreBrandTokens["shape"],
  { card: string; control: string; media: string }
> = {
  soft: {
    card: "rounded-2xl",
    control: "rounded-xl",
    media: "rounded-xl",
  },
  crisp: {
    card: "rounded-none",
    control: "rounded-none",
    media: "rounded-none",
  },
  pill: {
    card: "rounded-[2rem]",
    control: "rounded-full",
    media: "rounded-[1.5rem]",
  },
};

function isAllowedValue<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export type ResolvedOutletDesign = {
  preset: StoreLayoutPreset;
  tokens: StoreBrandTokens;
  palette: OutletPaletteDefinition;
  themeKey: `preset:${StoreLayoutPreset}:${StoreBrandTokens["palette"]}:${StoreBrandTokens["typography"]}:${StoreBrandTokens["shape"]}`;
};

/** Legacy standard Outlets retain the classic storefront until explicit opt-in. */
export function hasCreatorPreset(
  store: Pick<StoreContext, "layout_preset">,
): boolean {
  return store.layout_preset !== null && store.layout_preset !== undefined;
}

/**
 * Treat the database shape as untrusted even though the API validates writes.
 * Old rows, manual imports, or a partially rolled-out migration should render
 * the known-good Manifold design instead of creating invalid class names.
 */
export function resolveOutletDesign(
  store: Pick<StoreContext, "layout_preset" | "brand_tokens">,
): ResolvedOutletDesign {
  const preset = isAllowedValue(store?.layout_preset, STORE_LAYOUT_PRESETS)
    ? store.layout_preset
    : DEFAULT_STORE_LAYOUT_PRESET;
  const persistedTokens = store?.brand_tokens;
  const tokens: StoreBrandTokens = {
    palette: isAllowedValue(persistedTokens?.palette, STORE_PALETTES)
      ? persistedTokens.palette
      : DEFAULT_STORE_BRAND_TOKENS.palette,
    typography: isAllowedValue(persistedTokens?.typography, STORE_TYPOGRAPHIES)
      ? persistedTokens.typography
      : DEFAULT_STORE_BRAND_TOKENS.typography,
    shape: isAllowedValue(persistedTokens?.shape, STORE_SHAPES)
      ? persistedTokens.shape
      : DEFAULT_STORE_BRAND_TOKENS.shape,
  };

  return {
    preset,
    tokens,
    palette: OUTLET_PALETTES[tokens.palette],
    themeKey: `preset:${preset}:${tokens.palette}:${tokens.typography}:${tokens.shape}`,
  };
}
