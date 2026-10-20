/**
 * Platform-controlled identities for hand-built storefronts.
 *
 * This module intentionally contains no React or dynamic imports so API/OG and
 * management surfaces can share the same allow-list without pulling bespoke
 * storefront bundles into their runtime.
 */
import { STOREFRONT_THEME } from "lib/storefront-theme-contract";

// Historical keys remain readable in publication snapshots. Only active keys
// receive a custom view, navigation shell, editor restriction or OG treatment.
export const BESPOKE_THEME_KEYS = [STOREFRONT_THEME.NEON_ALLEY] as const;

export type BespokeThemeKey = (typeof BESPOKE_THEME_KEYS)[number];

export function isBespokeThemeKey(
  themeKey: string | null | undefined,
): themeKey is BespokeThemeKey {
  return (
    typeof themeKey === "string" &&
    (BESPOKE_THEME_KEYS as readonly string[]).includes(themeKey)
  );
}

export const BESPOKE_OG_ARTWORK: Partial<Record<BespokeThemeKey, string>> = {};
