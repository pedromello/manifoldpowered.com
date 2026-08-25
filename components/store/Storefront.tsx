import { useStorefrontController } from "components/storefront/useStorefrontController";
import { StorefrontShell } from "components/storefront/StorefrontShell";
import { DefaultStorefront } from "components/storefront/default/DefaultStorefront";
import { DEFAULT_PALETTE } from "components/storefront/palette";
import { resolveStorefront } from "storefronts/registry";
import type { StoreContext } from "components/storefront/types";
import type { JsonLd } from "lib/seo";

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
  canonicalPath: string;
  socialImage: string;
  socialImageAlt: string;
  jsonLd?: JsonLd;
  heading?: string;
  /** The outlet being rendered. Absent on the platform-wide storefront. */
  store?: StoreContext | null;
  /** Renders the "Discover other Outlets" section at the bottom. Main storefront only. */
  showDiscover?: boolean;
  /** Explains the shared platform before the main catalogue. Main storefront only. */
  showPlatformWelcome?: boolean;
};

/**
 * Resolves which storefront design an outlet gets, and wires the controller to
 * it.
 *
 * The split is the whole point of the design: the controller half is identical
 * for every outlet — same endpoints, same URL state, same attribution — while
 * only the view half is swapped. A bespoke outlet therefore cannot lose search,
 * filtering or sale attribution by forgetting to reimplement them.
 */
export function Storefront({
  featuredEndpoint,
  listEndpoint,
  browsePath,
  searchPagePath,
  pageTitle,
  metaDescription,
  canonicalPath,
  socialImage,
  socialImageAlt,
  jsonLd,
  heading,
  store = null,
  showDiscover = false,
  showPlatformWelcome = false,
}: StorefrontProps) {
  const controller = useStorefrontController({
    featuredEndpoint,
    listEndpoint,
    browsePath,
    searchPagePath,
    storeSlug: store?.slug,
  });

  const custom = store ? resolveStorefront(store) : null;

  return (
    <StorefrontShell
      store={store}
      palette={custom?.palette ?? DEFAULT_PALETTE}
      title={pageTitle}
      description={metaDescription}
      canonicalPath={canonicalPath}
      socialImage={socialImage}
      socialImageAlt={socialImageAlt}
      jsonLd={jsonLd}
      themeKey={custom && store ? store.slug : "default"}
      enforceContract={!!store}
      hasGames={controller.games.length > 0}
    >
      {custom && store ? (
        <custom.Storefront {...controller} store={store} />
      ) : (
        <DefaultStorefront
          {...controller}
          store={store}
          heading={heading}
          showDiscover={showDiscover}
          showPlatformWelcome={showPlatformWelcome}
        />
      )}
    </StorefrontShell>
  );
}
