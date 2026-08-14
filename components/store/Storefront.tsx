import { useStorefrontController } from "components/storefront/useStorefrontController";
import { DefaultStorefront } from "components/storefront/default/DefaultStorefront";
import type { StoreContext } from "components/storefront/types";

export type StorefrontProps = {
  /** Endpoint used to fetch the hero's featured games (no query params appended). */
  featuredEndpoint: string;
  /** Endpoint used for the filtered "Just Arrived" list; receives `q`/`tags` query params. */
  listEndpoint: string;
  /** Base path for this storefront's own URL (used by category pills and self-links). */
  browsePath: string;
  /** Where the top search box's Enter/submit navigates to; receives a `q` query param. */
  searchPagePath: string;
  pageTitle: string;
  metaDescription: string;
  heading?: string;
  /** The outlet being rendered. Absent on the platform-wide storefront. */
  store?: StoreContext | null;
  /** Renders the "Discover other Outlets" section at the bottom. Main storefront only. */
  showDiscover?: boolean;
};

/**
 * Wires the storefront controller to the default view.
 *
 * Kept as a named component rather than folded into the pages because both
 * `/store` and `/store/[slug]` need the same wiring, and because a bespoke
 * outlet theme replaces only the view half — the controller call stays.
 */
export function Storefront({
  featuredEndpoint,
  listEndpoint,
  browsePath,
  searchPagePath,
  pageTitle,
  metaDescription,
  heading,
  store = null,
  showDiscover = false,
}: StorefrontProps) {
  const controller = useStorefrontController({
    featuredEndpoint,
    listEndpoint,
    browsePath,
    searchPagePath,
    storeSlug: store?.slug,
  });

  return (
    <DefaultStorefront
      {...controller}
      store={store}
      heading={heading}
      showDiscover={showDiscover}
      pageTitle={pageTitle}
      metaDescription={metaDescription}
    />
  );
}
