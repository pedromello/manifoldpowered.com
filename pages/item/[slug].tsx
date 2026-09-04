import { GetServerSideProps } from "next";

import webserver from "infra/webserver";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { StorefrontRouteLayout } from "components/store/StorefrontRouteLayout";
import { StorefrontShell } from "components/storefront/StorefrontShell";
import { OutletPreviewBanner } from "components/storefront/OutletPreviewBanner";
import { DefaultItemPage } from "components/storefront/default/item/DefaultItemPage";
import { useItemController } from "components/storefront/useItemController";
import { PLATFORM_PALETTE } from "components/storefront/palette";
import { resolveStorefront } from "storefronts/registry";
import { storeSlugFromQuery } from "lib/store-context";
import {
  storeContextFromApi,
  type GameDetailApi,
  type StoreApi,
} from "components/store/types";
import { useI18n } from "lib/i18n";
import { headersForInternalFetch } from "lib/internal-fetch";
import { gameJsonLd, gameMetadata, socialImageUrl } from "lib/seo";
import { fetchPageData } from "lib/page-data";
import {
  hasCreatorPreset,
  resolveOutletDesign,
} from "components/storefront/presets/config";

type ItemPageProps = {
  game: GameDetailApi;
  /** The outlet this visit came through, or null for a direct visit. */
  store: StoreApi | null;
  /** Authorized working-draft context; never inferred from store status. */
  isPreview: boolean;
  /** Original attribution candidate, kept separate from public Store display. */
  requestedStoreSlug: string | null;
  outletReview: GameDetailApi["outlet_review"];
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const slug = Array.isArray(context.query.slug)
    ? context.query.slug[0]
    : context.query.slug;
  const storeSlug = storeSlugFromQuery(context.query);
  const isPreview = context.query.preview === "1";
  const locale = context.locale === "pt-BR" ? "pt-BR" : "en";

  if (isPreview) {
    context.res.setHeader("Cache-Control", "private, no-store");
    context.res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const vary = String(context.res.getHeader("Vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!vary.some((value) => value.toLowerCase() === "cookie")) {
      vary.push("Cookie");
    }
    context.res.setHeader("Vary", vary.join(", "));
  }
  if (!slug || (isPreview && !storeSlug)) return { notFound: true };

  // Forwarded because the price shown here is regional (models/region.ts).
  // Without it a Brazilian visitor saw BRL on the storefront list and USD on
  // this page for the same game.
  const headers = headersForInternalFetch(context.req.headers);

  try {
    const game = await fetchPageData<GameDetailApi>(
      `${webserver.getOrigin()}/api/v1/items/games/${slug}?locale=${locale}`,
      { headers },
    );

    if (!game) return { notFound: true };

    // `?store=` is visitor-supplied, so an unknown or malformed value must
    // degrade to an unattributed page rather than 404 a game that exists.
    let store: StoreApi | null = null;
    let outletReview: GameDetailApi["outlet_review"] = null;
    if (storeSlug) {
      try {
        const storeUrl = new URL(
          `/api/v1/stores/${encodeURIComponent(storeSlug)}`,
          webserver.getOrigin(),
        );
        if (isPreview) storeUrl.searchParams.set("preview", "1");
        const storeResponse = await fetch(storeUrl, { headers });
        if (storeResponse.ok) {
          store = await storeResponse.json();
          const reviewUrl = new URL(
            `/api/v1/stores/${encodeURIComponent(storeSlug)}/game-editorials/${encodeURIComponent(slug)}`,
            webserver.getOrigin(),
          );
          if (isPreview) reviewUrl.searchParams.set("preview", "1");
          const reviewResponse = await fetch(reviewUrl, { headers });
          if (reviewResponse.ok) {
            const payload = await reviewResponse.json();
            outletReview = payload.review ?? null;
          }
        } else if (isPreview) {
          return { notFound: true };
        }
      } catch {
        if (isPreview) return { notFound: true };
        store = null;
      }
    }

    return {
      props: {
        game,
        store,
        isPreview,
        requestedStoreSlug: storeSlug ?? null,
        outletReview,
      },
    };
  } catch (error) {
    console.error("Error fetching game via API:", error);
    throw error;
  }
};

export default function GameDetailsPage({
  game,
  store,
  isPreview,
  requestedStoreSlug,
  outletReview,
}: ItemPageProps) {
  const { locale } = useI18n();
  const metadata = gameMetadata(game, locale);
  const controller = useItemController({
    gameSlug: game.slug,
    storeSlug: store?.slug,
    attributionStoreSlug: requestedStoreSlug ?? undefined,
    isPreview,
  });
  const viewStore = store ? storeContextFromApi(store) : null;

  // An outlet with a bespoke storefront but no bespoke product page still gets
  // its palette here, so the click from its catalogue does not jump back to
  // Manifold's colours mid-journey.
  const resolution = viewStore ? resolveStorefront(viewStore) : null;
  const custom = resolution?.kind === "custom" ? resolution.storefront : null;
  const outletDesign =
    viewStore && !custom && hasCreatorPreset(viewStore)
      ? resolveOutletDesign(viewStore)
      : null;
  const ItemView = custom?.ItemPage ?? DefaultItemPage;

  const page = (
    <StorefrontShell
      store={viewStore}
      palette={custom?.palette ?? outletDesign?.palette ?? PLATFORM_PALETTE}
      title={metadata.title}
      description={metadata.description}
      canonicalPath={`/item/${game.slug}`}
      socialImage={
        isPreview ? undefined : socialImageUrl("game", locale, game.slug)
      }
      socialImageAlt={
        isPreview
          ? undefined
          : locale === "pt-BR"
            ? `Arte de ${game.title}, de ${game.developer_name}, com a marca Manifold`
            : `${game.title} artwork by ${game.developer_name} with Manifold branding`
      }
      jsonLd={isPreview ? undefined : gameJsonLd(game, locale)}
      noIndex={isPreview}
    >
      {isPreview && store && <OutletPreviewBanner storeSlug={store.slug} />}
      <ItemView
        {...controller}
        game={game}
        store={viewStore}
        outletReview={outletReview}
      />
    </StorefrontShell>
  );

  if (!store) {
    return <StoreHomeLayout>{page}</StoreHomeLayout>;
  }

  return (
    <StorefrontRouteLayout store={viewStore} visitorPreview={isPreview}>
      {page}
    </StorefrontRouteLayout>
  );
}
