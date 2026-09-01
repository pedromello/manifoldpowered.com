import type { DisplayPrice } from "lib/price";
import {
  DEFAULT_STORE_BRAND_TOKENS,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_SHAPES,
  STORE_TYPOGRAPHIES,
  type StoreBrandTokens,
  type StoreLayoutPreset,
  type StorePresentationSnapshot,
  type StoreSocialLinks,
} from "contracts/store-presentation";
export {
  STORE_LAYOUT_PRESETS as OUTLET_LAYOUT_PRESETS,
  STORE_PALETTES as OUTLET_BRAND_PALETTES,
  STORE_SHAPES as OUTLET_BRAND_SHAPES,
  STORE_TYPOGRAPHIES as OUTLET_BRAND_TYPOGRAPHY,
} from "contracts/store-presentation";

export type ExternalOffer = {
  provider: "STEAM";
  amount: string | null;
  original_amount: string | null;
  discount_percent: number | null;
  currency: string | null;
  url: string;
  captured_at: string | null;
};

/**
 * The wire shape of a game as it leaves `filterOutput(user, "read:public_game")`,
 * with the `display_price` that `models/storefront_pricing.filterAndPrice` appends.
 *
 * This lived inside `components/store/GameListItem.tsx` until it had six importers
 * that did not otherwise care about that component. It is the canonical API type
 * for every storefront surface, so it belongs next to the other API types rather
 * than inside a presentational component.
 */
export type GameApi = {
  id: string;
  slug: string;
  title: string;
  description: string;
  detailed_description: string;
  launch_date: string;
  price: string | null;
  base_price?: string | null;
  display_price?: DisplayPrice | null;
  discount_label?: string;
  developer_name: string;
  publisher_name?: string;
  tags: string[];
  media: {
    banner?: string;
    screenshots: string[];
    icon?: string;
    videos: string[];
  };
  status?: "ACTIVE" | "ONLY_DISPLAY" | "INACTIVE" | "PRIVATE";
  ownership_status?: "UNCLAIMED" | "CLAIMED";
  purchase_mode: "STEAM_ONLY" | "UNAVAILABLE" | "PLATFORM";
  external_offer: ExternalOffer | null;
  positive_reviews?: number;
  negative_reviews?: number;
  review_score?: string | null;
  /** Outlet-authored editorial copy; present only in editorial Featured feeds. */
  recommendation_reason?: string | null;
  /** Distinguishes Outlet picks from automatic carousel fillers. */
  featured_source?: "EDITORIAL" | "AUTOMATIC";
};

/**
 * A game as the detail endpoint returns it. The list endpoints emit the same
 * row, but only the product page reads these two JSON columns, so they are
 * kept off `GameApi` rather than marked optional on every card.
 */
export type GameDetailApi = GameApi & {
  meta_tags: {
    category?: string;
    rating?: string;
    languages?: string[];
    keywords?: string[];
    platforms?: string[];
  };
  social_links: {
    website?: string;
    twitter?: string;
    discord?: string;
    steam_page?: string;
  };
};

export type OutletLayoutPreset = StoreLayoutPreset;
export type OutletBrandTokens = StoreBrandTokens;
export type OutletSocialLinks = StoreSocialLinks;

/**
 * Versioned visual configuration selected by the Store read model. Public
 * reads receive the published revision and preview reads the working draft.
 */
export type StorePresentation = StorePresentationSnapshot;

/**
 * The wire shape of a store as it leaves the
 * `create:store | read:public_store | update:store` branch of `filterOutput`.
 *
 * `commission_rate` is deliberately absent: it is served only by the separate
 * admin branch and must never reach a storefront.
 */
export type StoreApi = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  /** Registry-controlled and never accepted by the owner-facing write schema. */
  theme_key?: string | null;
  layout_preset?: OutletLayoutPreset | null;
  tagline?: string | null;
  cover_url?: string | null;
  social_links?: OutletSocialLinks;
  brand_tokens?: OutletBrandTokens;
  owner_id: string;
  /** Present on creator/private reads and safe to ignore on older public payloads. */
  status?: "DRAFT" | "PUBLISHED";
  published_at?: string | null;
  catalog_mode?: "UNDECIDED" | "ALL" | "SELECTED" | "LEGACY_ALL";
  storefront_source?: "DRAFT" | "REVISION";
  presentation?: StorePresentation | null;
  draft_revision?: number;
  last_published_at?: string | null;
  published_revision?: {
    id: string;
    revision: number;
    source_draft_revision: number;
  } | null;
  created_at: string;
  updated_at: string;
};

/** Owner-only draft metadata returned by `?preview=1` and write endpoints. */
export type StoreManagementApi = StoreApi & {
  draft_revision: number;
};

function allowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase() as T;
  return allowed.includes(normalized) ? normalized : null;
}

/**
 * Adapts the versioned S0 wire projection to the stable view contract used by
 * standard, preset and bespoke storefronts. Materialized draft fields win
 * when present; public reads otherwise use the selected revision's
 * `presentation`. An explicit null layout remains the classic storefront.
 */
export function storeContextFromApi(store: StoreApi) {
  const presentation = store.presentation;
  const layoutPreset =
    store.layout_preset !== undefined
      ? store.layout_preset
      : allowedValue(presentation?.layout_preset, STORE_LAYOUT_PRESETS);
  const palette = allowedValue(
    presentation?.brand_tokens.palette,
    STORE_PALETTES,
  );
  const typography = allowedValue(
    presentation?.brand_tokens.typography,
    STORE_TYPOGRAPHIES,
  );
  const shape = allowedValue(presentation?.brand_tokens.shape, STORE_SHAPES);

  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    description: store.description,
    logo_url: store.logo_url,
    theme_key:
      store.theme_key !== undefined
        ? store.theme_key
        : (presentation?.theme_key ?? null),
    layout_preset: layoutPreset ?? null,
    tagline:
      store.tagline !== undefined
        ? store.tagline
        : (presentation?.tagline ?? null),
    cover_url:
      store.cover_url !== undefined
        ? store.cover_url
        : (presentation?.cover_image_url ?? null),
    social_links:
      store.social_links ??
      (presentation?.social_links as OutletSocialLinks | undefined) ??
      {},
    brand_tokens: store.brand_tokens ?? {
      palette: palette ?? DEFAULT_STORE_BRAND_TOKENS.palette,
      typography: typography ?? DEFAULT_STORE_BRAND_TOKENS.typography,
      shape: shape ?? DEFAULT_STORE_BRAND_TOKENS.shape,
    },
    presentation,
  };
}

// The pagination envelope already lives with the component that consumes it.
// Re-exported here so a storefront surface can pull every API type it needs
// from one module without a second import path.
export type { PaginationApi } from "components/Pagination";
