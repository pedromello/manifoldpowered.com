export const STOREFRONT_THEME = {
  NEON_ALLEY: "neon-alley",
  STRATEGOS_VOID: "strategos-void",
} as const;

export const STORE_THEME_KEYS = [
  STOREFRONT_THEME.NEON_ALLEY,
  STOREFRONT_THEME.STRATEGOS_VOID,
] as const;

export type StoreThemeKey = (typeof STORE_THEME_KEYS)[number];

export function authoritativeStoreThemeKey(slug: string): StoreThemeKey | null {
  return (STORE_THEME_KEYS as readonly string[]).includes(slug)
    ? (slug as StoreThemeKey)
    : null;
}
