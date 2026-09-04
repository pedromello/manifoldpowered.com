/**
 * Platform-controlled identities for hand-built storefronts.
 *
 * This module intentionally contains no React or dynamic imports so API/OG and
 * management surfaces can share the same allow-list without pulling bespoke
 * storefront bundles into their runtime.
 */
import {
  authoritativeStoreThemeKey,
  STORE_THEME_KEYS,
  type StoreThemeKey,
} from "lib/storefront-theme-contract";

export const BESPOKE_THEME_KEYS = STORE_THEME_KEYS;

export type BespokeThemeKey = StoreThemeKey;

export function isBespokeThemeKey(
  themeKey: string | null | undefined,
): themeKey is BespokeThemeKey {
  return (
    typeof themeKey === "string" &&
    authoritativeStoreThemeKey(themeKey) !== null
  );
}

export const BESPOKE_OG_ARTWORK: Partial<Record<BespokeThemeKey, string>> = {
  "strategos-void": "/storefronts/strategos-void/logo.jpg",
};
