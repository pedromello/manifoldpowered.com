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

export const STORE_PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type StorePublicationStatus =
  (typeof STORE_PUBLICATION_STATUSES)[number];

/**
 * The immutable presentation payload captured by each StoreRevision.
 * Slug, ownership, and commercial terms stay on Store. Curation is captured
 * separately in StoreCurationSnapshot so a publish can switch both atomically.
 */
export type StorePresentationSnapshot = {
  name: string;
  description: string | null;
  logo_url: string | null;
  theme_key: string | null;
  layout_preset: StoreLayoutPreset | null;
  tagline: string | null;
  cover_url: string | null;
  social_links: StoreSocialLinks;
  brand_tokens: StoreBrandTokens;
};

export const STORE_CURATION_STRATEGIES = [
  "NONE",
  "RULES",
  "MANUAL",
  "MIXED",
] as const;
export type StoreCurationStrategy = (typeof STORE_CURATION_STRATEGIES)[number];

export type StoreFeaturedSnapshot = {
  game_id: string;
  position: number;
  recommendation_reason: string | null;
};

export type StoreTagFilterSnapshot = {
  tag: string;
  mode: "WHITELIST" | "BLACKLIST";
};

export type StoreGameOverrideSnapshot = {
  game_id: string;
  visibility: "SHOW" | "HIDE";
};

export type StoreCurationSnapshot = {
  curation_strategy: StoreCurationStrategy;
  featured_games: StoreFeaturedSnapshot[];
  tag_filters: StoreTagFilterSnapshot[];
  game_overrides: StoreGameOverrideSnapshot[];
};

export type StoreRevisionSnapshot = StorePresentationSnapshot &
  StoreCurationSnapshot;
