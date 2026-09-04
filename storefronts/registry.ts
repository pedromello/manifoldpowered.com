import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { StorefrontPalette } from "components/storefront/palette";
import { neonAlleyPalette } from "storefronts/neon-alley/palette";
import { strategosVoidPalette } from "storefronts/strategos-void/palette";
import type {
  ItemViewProps,
  StorefrontViewProps,
} from "components/storefront/types";
import {
  BESPOKE_THEME_KEYS,
  isBespokeThemeKey,
  type BespokeThemeKey,
} from "storefronts/bespoke";

/**
 * One bespoke outlet.
 *
 * `Storefront` is required, `ItemPage` is not: an outlet that wants its own
 * catalogue page but is happy with Manifold's product page simply omits it.
 */
export type CustomStorefront = {
  Storefront: ComponentType<StorefrontViewProps>;
  ItemPage?: ComponentType<ItemViewProps>;
  /**
   * Statically imported, unlike the components. SSR needs the palette before
   * the lazy chunk resolves, and a palette is ~10 lines — 50 outlets cost
   * nothing in the eager bundle, while their components cost nothing to a
   * visitor who never opens them.
   */
  palette: StorefrontPalette;
};

export type StorefrontResolution =
  | {
      kind: "standard";
      themeKey: "platform";
    }
  | {
      kind: "custom";
      themeKey: string;
      storefront: CustomStorefront;
    };

/**
 * Every Outlet with a hand-built storefront, keyed by an internal theme key.
 *
 * Entries must be static object literals with `next/dynamic` imports so the
 * bundler can split them. Building this map at runtime would defeat that and
 * ship all fifty outlets to every visitor.
 *
 * `theme_key` is migration/admin-controlled and intentionally absent from the
 * owner-facing write schema. A creator can therefore never claim one of these
 * entries by renaming an Outlet or by choosing a self-service preset.
 */
const CUSTOM_STOREFRONTS: Record<BespokeThemeKey, CustomStorefront> = {
  "neon-alley": {
    Storefront: dynamic(
      () =>
        import("storefronts/neon-alley/Storefront").then(
          (m) => m.NeonAlleyStorefront,
        ),
      // Never false: SSR is what keeps the palette in the first byte and the
      // outlet in search results.
      { ssr: true },
    ),
    palette: neonAlleyPalette,
  },
  "strategos-void": {
    Storefront: dynamic(
      () =>
        import("storefronts/strategos-void/Storefront").then(
          (m) => m.StrategosVoidStorefront,
        ),
      { ssr: true },
    ),
    palette: strategosVoidPalette,
  },
};

/**
 * The single place a store becomes a theme.
 *
 * Bespoke resolution is deliberately independent from self-service
 * `layout_preset`. Anything unrecognised resolves explicitly to `standard`: a
 * stale key degrades safely instead of letting one Outlet impersonate another.
 */
export function resolveStorefront(store: {
  slug: string;
  theme_key?: string | null;
}): StorefrontResolution {
  const themeKey = store.theme_key;
  const storefront = isBespokeThemeKey(themeKey)
    ? CUSTOM_STOREFRONTS[themeKey]
    : null;

  if (!storefront) {
    return { kind: "standard", themeKey: "platform" };
  }

  return {
    kind: "custom",
    themeKey,
    storefront,
  };
}

/** Registered theme keys, retained under the old name for docs/tooling callers. */
export function registeredStorefrontSlugs(): string[] {
  return [...BESPOKE_THEME_KEYS];
}

export const registeredStorefrontThemeKeys = registeredStorefrontSlugs;

export function isRegisteredStorefrontThemeKey(
  themeKey: string | null | undefined,
): boolean {
  return isBespokeThemeKey(themeKey);
}
