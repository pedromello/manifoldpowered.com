import { useStorefrontController } from "components/storefront/useStorefrontController";
import { StorefrontShell } from "components/storefront/StorefrontShell";
import { DefaultStorefront } from "components/storefront/default/DefaultStorefront";
import { PLATFORM_PALETTE } from "components/storefront/palette";
import { resolveStorefront } from "storefronts/registry";
import type { StoreContext } from "components/storefront/types";
import type { JsonLd } from "lib/seo";
import { LockKeyhole } from "lucide-react";

import { FollowOutletButton } from "components/store/FollowOutletButton";
import { OutletPreviewBanner } from "components/storefront/OutletPreviewBanner";
import { useI18n } from "lib/i18n";

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
  socialImage?: string;
  socialImageAlt?: string;
  jsonLd?: JsonLd;
  /** The outlet being rendered. Absent on the platform-wide storefront. */
  store?: StoreContext | null;
  /** Renders the "Discover other Outlets" section at the bottom. Main storefront only. */
  showDiscover?: boolean;
  /** A private, authenticated rendering of the working draft. */
  isPreview?: boolean;
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
  store = null,
  showDiscover = false,
  isPreview = false,
}: StorefrontProps) {
  const { t } = useI18n();
  const controller = useStorefrontController({
    featuredEndpoint,
    listEndpoint,
    browsePath,
    searchPagePath,
    storeSlug: store?.slug,
    isPreview,
  });

  const resolution = store ? resolveStorefront(store) : null;
  const custom = resolution?.kind === "custom" ? resolution.storefront : null;
  const followControl =
    store && isPreview ? (
      <button
        type="button"
        data-storefront="follow-outlet"
        disabled
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sf-border bg-sf-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-sf-muted"
      >
        <LockKeyhole size={15} aria-hidden="true" />
        {t("Draft")}
      </button>
    ) : store ? (
      <FollowOutletButton
        storeSlug={store.slug}
        storeName={store.name}
        variant={custom ? "theme" : "platform"}
      />
    ) : null;

  return (
    <StorefrontShell
      store={store}
      palette={custom?.palette ?? PLATFORM_PALETTE}
      title={pageTitle}
      description={metaDescription}
      canonicalPath={canonicalPath}
      socialImage={socialImage}
      socialImageAlt={socialImageAlt}
      jsonLd={jsonLd}
      themeKey={resolution?.themeKey ?? "platform"}
      enforceContract={!!store}
      hasGames={controller.games.length > 0}
      noIndex={isPreview}
    >
      {store && isPreview && <OutletPreviewBanner storeSlug={store.slug} />}
      {custom && store ? (
        <custom.Storefront
          {...controller}
          store={store}
          followControl={followControl}
        />
      ) : (
        <DefaultStorefront
          {...controller}
          store={store}
          followControl={followControl}
          showDiscover={showDiscover}
        />
      )}
    </StorefrontShell>
  );
}
