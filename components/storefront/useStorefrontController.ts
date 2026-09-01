import { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

import { CATEGORIES } from "lib/categories";
import { itemHref as buildItemHref } from "lib/store-context";
import type {
  GameApi,
  PaginationApi,
  StorefrontControllerResult,
  StorefrontOrder,
  StorefrontQuery,
} from "components/storefront/types";
import { STOREFRONT_ORDERS } from "components/storefront/types";
import { withLocale } from "lib/localized-api";

type ListResponse = {
  games: GameApi[];
  pagination?: PaginationApi;
  currency?: string;
  mode?: "EDITORIAL" | "HYBRID" | "AUTOMATIC";
};

const fetcher = (url: string): Promise<ListResponse> =>
  fetch(url).then((res) => res.json());

function localUrl(path: string) {
  return new URL(path, "http://manifold.local");
}

function relativeUrl(url: URL) {
  return `${url.pathname}${url.search}`;
}

export type StorefrontControllerOptions = {
  /** Hero rail source. Receives no query params. */
  featuredEndpoint: string;
  /** Filtered list source. Receives q/tags/order/page. */
  listEndpoint: string;
  /** This storefront's own URL, used to build category and pagination links. */
  browsePath: string;
  /** Where the search form submits. Usually the same as `browsePath`. */
  searchPagePath: string;
  /** Set for an outlet storefront so links carry sale attribution. */
  storeSlug?: string;
  /** Preserve working-draft context through APIs, navigation and item links. */
  isPreview?: boolean;
};

function isOrder(value: string | null): value is StorefrontOrder {
  return value !== null && STOREFRONT_ORDERS.includes(value as StorefrontOrder);
}

/**
 * All of a storefront's data and URL state, with no markup attached.
 *
 * This is the union of what `components/store/Storefront.tsx` did (featured
 * rail, single category, free-text search) and what `pages/search/index.tsx`
 * did (multi-tag facets, sort order) — the two had drifted into separate
 * implementations of the same idea against the same endpoint, which is also
 * why `page`, `order` and `min_price` were supported server-side with no
 * client ever sending them.
 */
export function useStorefrontController({
  featuredEndpoint,
  listEndpoint,
  browsePath,
  searchPagePath,
  storeSlug,
  isPreview = false,
}: StorefrontControllerOptions): StorefrontControllerResult {
  const router = useRouter();
  const locale = router.locale === "pt-BR" ? "pt-BR" : "en";
  const searchParams = useSearchParams();

  const q = searchParams.get("q") || "";
  const activeCategory = searchParams.get("category");
  const tags = searchParams.getAll("tags");
  const orderParam = searchParams.get("order");
  const order: StorefrontOrder = isOrder(orderParam) ? orderParam : "newest";
  const page = Number(searchParams.get("page")) || 1;

  // The category pill and the tag facets both narrow by tag; the API takes a
  // single comma-separated `tags` list, so they merge here rather than in the
  // views.
  const effectiveTags = useMemo(() => {
    const merged = new Set(tags);
    if (activeCategory) merged.add(activeCategory);
    return Array.from(merged);
  }, [tags, activeCategory]);

  // Only non-default values are sent, so the request URL — and therefore the
  // SWR cache key — stays exactly what it was before this hook existed.
  const listUrl = useMemo(() => {
    const url = localUrl(listEndpoint);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    if (effectiveTags.length > 0) {
      url.searchParams.set("tags", effectiveTags.join(","));
    } else {
      url.searchParams.delete("tags");
    }
    if (order !== "newest") url.searchParams.set("order", order);
    else url.searchParams.delete("order");
    if (page > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    url.searchParams.set("locale", locale);
    return relativeUrl(url);
  }, [listEndpoint, q, effectiveTags, order, page, locale]);

  const { data: featuredData, isLoading: isFeaturedLoading } =
    useSWR<ListResponse>(withLocale(featuredEndpoint, locale), fetcher);

  const { data, isLoading } = useSWR<ListResponse>(listUrl, fetcher);

  const browseHref = useCallback(
    (patch: Partial<StorefrontQuery>) => {
      const next: StorefrontQuery = {
        q,
        category: activeCategory,
        tags,
        order,
        page,
        ...patch,
      };

      const url = localUrl(browsePath);
      ["q", "category", "tags", "order", "page"].forEach((key) =>
        url.searchParams.delete(key),
      );
      if (next.q) url.searchParams.set("q", next.q);
      if (next.category) url.searchParams.set("category", next.category);
      next.tags.forEach((tag) => url.searchParams.append("tags", tag));
      if (next.order !== "newest") url.searchParams.set("order", next.order);
      if (next.page > 1) url.searchParams.set("page", String(next.page));

      return relativeUrl(url);
    },
    [browsePath, q, activeCategory, tags, order, page],
  );

  // Shallow so filtering never refetches the page's server props, matching how
  // pages/search already behaved.
  const navigate = useCallback(
    (patch: Partial<StorefrontQuery>) => {
      router.push(browseHref(patch), undefined, { shallow: true });
    },
    [router, browseHref],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const next = new Set(tags);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      navigate({ tags: Array.from(next), page: 1 });
    },
    [tags, navigate],
  );

  const itemHref = useCallback(
    (gameSlug: string) => buildItemHref(gameSlug, storeSlug, isPreview),
    [storeSlug, isPreview],
  );

  const searchUrl = localUrl(searchPagePath);
  const searchHiddenFields = Object.fromEntries(searchUrl.searchParams);

  return {
    isPreview,
    featured: featuredData?.games || [],
    featuredMode: featuredData?.mode || "AUTOMATIC",
    isFeaturedLoading,

    games: data?.games || [],
    isLoading,
    pagination: data?.pagination,
    currency: data?.currency || "USD",

    q,
    // A new search starts from the first page; staying on page 4 of the old
    // result set is the classic way to land on an empty list.
    setQuery: (value) => navigate({ q: value, page: 1 }),
    activeCategory,
    setCategory: (category) => navigate({ category, page: 1 }),
    tags,
    toggleTag,
    order,
    setOrder: (value) => navigate({ order: value, page: 1 }),
    page,
    setPage: (updater) => navigate({ page: updater(page) }),
    categories: CATEGORIES,

    itemHref,
    browseHref,
    searchAction: searchUrl.pathname,
    searchHiddenFields,
  };
}
