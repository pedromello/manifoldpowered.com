/**
 * Platform-controlled identities for hand-built storefronts.
 *
 * This module intentionally contains no React or dynamic imports so API/OG and
 * management surfaces can share the same allow-list without pulling bespoke
 * storefront bundles into their runtime.
 */
export const BESPOKE_THEME_KEYS = ["neon-alley", "strategos-void"] as const;

export type BespokeThemeKey = (typeof BESPOKE_THEME_KEYS)[number];

export function isBespokeThemeKey(
  themeKey: string | null | undefined,
): themeKey is BespokeThemeKey {
  return BESPOKE_THEME_KEYS.some((registered) => registered === themeKey);
}

export const BESPOKE_OG_ARTWORK: Partial<Record<BespokeThemeKey, string>> = {
  "strategos-void": "/storefronts/strategos-void/logo.jpg",
};
