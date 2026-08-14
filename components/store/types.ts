import { DisplayPrice } from "lib/price";

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
  price: string;
  base_price?: string;
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
  status?: "ACTIVE" | "INACTIVE" | "PRIVATE";
  positive_reviews?: number;
  negative_reviews?: number;
  review_score?: string | null;
};

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
  owner_id: string;
  created_at: string;
  updated_at: string;
};

// The pagination envelope already lives with the component that consumes it.
// Re-exported here so a storefront surface can pull every API type it needs
// from one module without a second import path.
export type { PaginationApi } from "components/Pagination";
