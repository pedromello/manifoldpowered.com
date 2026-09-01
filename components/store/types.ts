import { DisplayPrice } from "lib/price";
import type {
  StoreBrandTokens,
  StoreCurationStrategy,
  StoreLayoutPreset,
  StorePublicationStatus,
  StoreSocialLinks,
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
  theme_key: string | null;
  layout_preset: OutletLayoutPreset | null;
  tagline: string | null;
  cover_url: string | null;
  social_links: OutletSocialLinks;
  brand_tokens: OutletBrandTokens;
  owner_id: string;
  publication_status: StorePublicationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Owner-only draft metadata returned by `?preview=1` and write endpoints. */
export type StoreManagementApi = StoreApi & {
  draft_revision: number;
  has_unpublished_changes: boolean;
  publication_readiness: {
    ready: boolean;
    blockers: Array<
      | "IDENTITY_INCOMPLETE"
      | "CURATION_STRATEGY_REQUIRED"
      | "MINIMUM_GAMES_REQUIRED"
      | "FEATURED_REQUIRED"
    >;
    checks: {
      identity_complete: boolean;
      strategy_chosen: boolean;
      strategy: StoreCurationStrategy;
      selected_games: number;
      minimum_games: number;
      featured_games: number;
    };
  };
};

// The pagination envelope already lives with the component that consumes it.
// Re-exported here so a storefront surface can pull every API type it needs
// from one module without a second import path.
export type { PaginationApi } from "components/Pagination";
