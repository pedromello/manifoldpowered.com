import { useStorefrontController } from "components/storefront/useStorefrontController";
import { StorefrontShell } from "components/storefront/StorefrontShell";
import { DefaultStorefront } from "components/storefront/default/DefaultStorefront";
import { PLATFORM_PALETTE } from "components/storefront/palette";
import { resolveStorefront } from "storefronts/registry";
import type { StoreContext } from "components/storefront/types";
import type { JsonLd } from "lib/seo";
import { FollowOutletButton } from "components/store/FollowOutletButton";
import { CreatorPresetStorefront } from "components/storefront/presets/CreatorPresetStorefront";
import {
  hasCreatorPreset,
  resolveOutletDesign,
} from "components/storefront/presets/config";
import { useI18n } from "lib/i18n";

const NO_PERSISTENT_QUERY: Readonly<Record<string, string>> = {};
const PREVIEW_PERSISTENT_QUERY: Readonly<Record<string, string>> = {
  preview: "1",
};

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
  /** The outlet being rendered. Absent on the platform-wide storefront. */
  store?: StoreContext | null;
  /** Renders the "Discover other Outlets" section at the bottom. Main storefront only. */
  showDiscover?: boolean;
  /** Management preview renders visitor controls while the server authorizes draft data. */
  visitorPreview?: boolean;
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
  visitorPreview = false,
}: StorefrontProps) {
  const { t } = useI18n();
  const controller = useStorefrontController({
    featuredEndpoint,
    listEndpoint,
    browsePath,
    searchPagePath,
    storeSlug: store?.slug,
    persistentQuery: visitorPreview
      ? PREVIEW_PERSISTENT_QUERY
      : NO_PERSISTENT_QUERY,
  });

  const resolution = store ? resolveStorefront(store) : null;
  const custom = resolution?.kind === "custom" ? resolution.storefront : null;
  const outletDesign =
    store && !custom && hasCreatorPreset(store)
      ? resolveOutletDesign(store)
      : null;
  const followControl = store ? (
    visitorPreview ? (
      <button
        type="button"
        disabled
        data-storefront="follow-outlet"
        className="inline-flex min-h-10 items-center rounded-xl border border-sf-border bg-sf-surface px-4 text-sm font-bold text-sf-muted"
      >
        {t("Follow")}
      </button>
    ) : (
      <FollowOutletButton
        storeSlug={store.slug}
        storeName={store.name}
        variant={custom ? "theme" : "platform"}
      />
    )
  ) : null;

  return (
    <StorefrontShell
      store={store}
      palette={custom?.palette ?? outletDesign?.palette ?? PLATFORM_PALETTE}
      title={pageTitle}
      description={metaDescription}
      canonicalPath={canonicalPath}
      socialImage={socialImage}
      socialImageAlt={socialImageAlt}
      jsonLd={jsonLd}
      noIndex={visitorPreview}
      themeKey={
        custom ? resolution?.themeKey : (outletDesign?.themeKey ?? "platform")
      }
      enforceContract={!!store}
      hasGames={controller.games.length > 0}
    >
      {custom && store ? (
        <custom.Storefront
          {...controller}
          store={store}
          followControl={followControl}
        />
      ) : store && outletDesign ? (
        <CreatorPresetStorefront
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
