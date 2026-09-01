import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { StorefrontPalette } from "components/storefront/palette";
import { neonAlleyPalette } from "storefronts/neon-alley/palette";
import { strategosVoidPalette } from "storefronts/strategos-void/palette";
import type {
  ItemViewProps,
  StorefrontViewProps,
} from "components/storefront/types";
import { STOREFRONT_THEME } from "lib/storefront-theme-contract";

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
 * Every outlet with a hand-built storefront, keyed by slug.
 *
 * Entries must be static object literals with `next/dynamic` imports so the
 * bundler can split them. Building this map at runtime would defeat that and
 * ship all fifty outlets to every visitor.
 *
 * An outlet that is not listed here falls through to Manifold's own design.
 */
const CUSTOM_STOREFRONTS: Record<string, CustomStorefront> = {
  [STOREFRONT_THEME.NEON_ALLEY]: {
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
  [STOREFRONT_THEME.STRATEGOS_VOID]: {
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
 * Takes the store object rather than a bare slug so moving this mapping into
 * the database later is a one-line change to this function body —
 * `CUSTOM_STOREFRONTS[store.theme_key ?? store.slug]` — with no call sites
 * touched. Anything unrecognised resolves explicitly to `standard`: a stale
 * or misspelled key degrades to Manifold's own design rather than erroring,
 * which is the right failure for a storefront that has to stay open.
 */
export function resolveStorefront(store: {
  slug: string;
  presentation?: { theme_key?: string | null } | null;
}): StorefrontResolution {
  const themeKey = store.presentation?.theme_key || store.slug;
  const storefront = CUSTOM_STOREFRONTS[themeKey];

  if (!storefront) {
    return { kind: "standard", themeKey: "platform" };
  }

  return {
    kind: "custom",
    themeKey,
    storefront,
  };
}

/** Registered slugs, for the conformance checklist in docs. */
export function registeredStorefrontSlugs(): string[] {
  return Object.keys(CUSTOM_STOREFRONTS);
}
