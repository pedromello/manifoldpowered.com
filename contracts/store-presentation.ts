export const STORE_LAYOUT_PRESETS = [
  "channel",
  "editorial",
  "community",
] as const;
export type StoreLayoutPreset = (typeof STORE_LAYOUT_PRESETS)[number];

export const STORE_PALETTES = ["manifold", "ember", "ocean"] as const;
export type StorePalette = (typeof STORE_PALETTES)[number];

export const STORE_TYPOGRAPHIES = ["modern", "editorial", "rounded"] as const;
export type StoreTypography = (typeof STORE_TYPOGRAPHIES)[number];

export const STORE_SHAPES = ["soft", "crisp", "pill"] as const;
export type StoreShape = (typeof STORE_SHAPES)[number];

export const STORE_SOCIAL_PLATFORMS = [
  "website",
  "youtube",
  "twitch",
  "instagram",
  "tiktok",
  "x",
  "discord",
  "bluesky",
] as const;
export type StoreSocialPlatform = (typeof STORE_SOCIAL_PLATFORMS)[number];

export type StoreSocialLinks = Partial<Record<StoreSocialPlatform, string>>;

export type StoreBrandTokens = {
  palette: StorePalette;
  typography: StoreTypography;
  shape: StoreShape;
};

export const DEFAULT_STORE_BRAND_TOKENS: StoreBrandTokens = {
  palette: "manifold",
  typography: "modern",
  shape: "soft",
};

export const DEFAULT_STORE_LAYOUT_PRESET: StoreLayoutPreset = "channel";

export const STORE_PRESENTATION_VERSION = 1 as const;

/** The versioned presentation JSON captured by each immutable StoreRevision. */
export type StorePresentationSnapshot = {
  version: typeof STORE_PRESENTATION_VERSION;
  theme_key: string | null;
  layout_preset: StoreLayoutPreset | null;
  tagline: string | null;
  cover_image_url: string | null;
  social_links: StoreSocialLinks;
  brand_tokens: StoreBrandTokens;
};

/** Owner-controlled draft values; `theme_key` is platform-controlled. */
export type StorePresentationDraft = Omit<
  StorePresentationSnapshot,
  "theme_key"
>;
