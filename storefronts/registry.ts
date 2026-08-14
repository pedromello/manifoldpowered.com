import type { ComponentType } from "react";

import type { StorefrontPalette } from "components/storefront/palette";
import type {
  ItemViewProps,
  StorefrontViewProps,
} from "components/storefront/types";

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

/**
 * Every outlet with a hand-built storefront, keyed by slug.
 *
 * Entries must be static object literals with `next/dynamic` imports so the
 * bundler can split them. Building this map at runtime would defeat that and
 * ship all fifty outlets to every visitor.
 *
 * Deliberately empty until an outlet is actually built — the seam below works
 * the same either way, and an empty registry means every outlet falls through
 * to the default.
 */
const CUSTOM_STOREFRONTS: Record<string, CustomStorefront> = {};

/**
 * The single place a store becomes a theme.
 *
 * Takes the store object rather than a bare slug so moving this mapping into
 * the database later is a one-line change to this function body —
 * `CUSTOM_STOREFRONTS[store.theme_key ?? store.slug]` — with no call sites
 * touched. Anything unrecognised returns null, which means the default: a
 * stale or misspelled key degrades to Manifold's own design rather than
 * erroring, which is the right failure for a storefront that has to stay open.
 */
export function resolveStorefront(store: {
  slug: string;
}): CustomStorefront | null {
  return CUSTOM_STOREFRONTS[store.slug] ?? null;
}

/** Registered slugs, for the conformance checklist in docs. */
export function registeredStorefrontSlugs(): string[] {
  return Object.keys(CUSTOM_STOREFRONTS);
}
