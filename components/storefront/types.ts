import type {
  GameApi,
  GameDetailApi,
  PaginationApi,
  StoreApi,
} from "components/store/types";
import type { ItemControllerResult } from "components/storefront/useItemController";
import type { ReactNode } from "react";

export type { GameApi, GameDetailApi, PaginationApi };

/**
 * The subset of a store a storefront view is allowed to render. Deliberately
 * narrower than `StoreApi`: a theme has no business reading `owner_id`, and
 * keeping it out means a theme can never accidentally leak it into markup.
 */
export type StoreContext = Pick<
  StoreApi,
  "id" | "slug" | "name" | "description" | "logo_url" | "presentation"
>;

/**
 * The order values `gameQuerySchema` accepts on the public list endpoints.
 * `featured`, `trending` and `new_releases` exist in the model layer but are
 * only reachable through their own endpoints, so they are not offered here.
 */
export const STOREFRONT_ORDERS = [
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "title_asc",
] as const;

export type StorefrontOrder = (typeof STOREFRONT_ORDERS)[number];

/** The URL-backed query state a storefront browse page carries. */
export type StorefrontQuery = {
  q: string;
  category: string | null;
  tags: string[];
  order: StorefrontOrder;
  page: number;
};

/**
 * Everything a storefront view receives, and the only thing it receives.
 *
 * A theme never fetches, never knows an endpoint URL, and never builds an href
 * by hand. That is what makes "same functionality, different face" tractable:
 * the data and the actions are already in the theme's hands, so a theme that
 * omits search is visibly unfinished rather than subtly broken, and a new
 * capability added here lights up across every theme at once.
 *
 * Note that `tsconfig.json` sets `strict: false`, so the compiler will not
 * catch a theme that accepts these props and never renders them. That job
 * belongs to `StorefrontContractGuard`.
 */
export type StorefrontViewProps = {
  store: StoreContext;
  /** True only for the authenticated working-draft rendering. */
  isPreview: boolean;
  /** Shared behavior; themes only decide where it belongs visually. */
  followControl: ReactNode;

  /**
   * The hero rail. Themes must handle any length including zero — the default
   * view historically rendered nothing at all below three, which left a new
   * outlet with two curated games showing a blank band.
   */
  featured: GameApi[];
  /** Whether the Outlet chose these games or the catalog ranked them. */
  featuredMode: "EDITORIAL" | "HYBRID" | "AUTOMATIC";
  isFeaturedLoading: boolean;
  featuredError?: Error;

  /** The required surface. A view that does not render this fails the contract. */
  games: GameApi[];
  isLoading: boolean;
  catalogError?: Error;
  /** True only after both preview data sources completed successfully. */
  isPreviewReady: boolean;
  pagination?: PaginationApi;
  /** ISO-4217 code the prices in `games` are denominated in. */
  currency: string;

  /**
   * URL-backed filter state. Themes must not mirror any of this in `useState`:
   * the URL is the source of truth, which is what keeps results shareable and
   * the back button honest.
   */
  q: string;
  setQuery: (q: string) => void;
  activeCategory: string | null;
  setCategory: (category: string | null) => void;
  tags: string[];
  toggleTag: (tag: string) => void;
  order: StorefrontOrder;
  setOrder: (order: StorefrontOrder) => void;
  page: number;
  setPage: (updater: (page: number) => number) => void;
  categories: readonly string[];

  /** Always use these — they carry the `?store=` sale attribution. */
  itemHref: (gameSlug: string) => string;
  browseHref: (patch: Partial<StorefrontQuery>) => string;
  /** Target for a `<Form action=...>` so search still works without JS. */
  searchAction: string;
  /** Query fields a GET search form must preserve, such as private preview. */
  searchHiddenFields: Readonly<Record<string, string>>;
};

/**
 * What `useStorefrontController` returns: the view contract minus the store,
 * which the page supplies since only the page knows whether it is rendering an
 * outlet or the platform-wide storefront.
 */
export type StorefrontControllerResult = Omit<
  StorefrontViewProps,
  "store" | "followControl"
>;

/**
 * The default view serves both `/store` (no outlet) and `/store/[slug]`, so it
 * accepts a nullable store where a bespoke theme — which is only ever resolved
 * from a real outlet — does not.
 */
export type DefaultStorefrontProps = StorefrontControllerResult & {
  store: StoreContext | null;
  followControl: ReactNode;
  showDiscover?: boolean;
};

/**
 * Everything a product-page view receives.
 *
 * `store` is nullable here in a way it is not on the storefront contract: a
 * visitor can reach a game directly, with no outlet attached. A bespoke item
 * page is only ever rendered when there *is* an outlet, so it can rely on it
 * being present.
 */
export type ItemViewProps = ItemControllerResult & {
  game: GameDetailApi;
  store: StoreContext | null;
};
