import { GetServerSideProps } from "next";

import webserver from "infra/webserver";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { StorefrontRouteLayout } from "components/store/StorefrontRouteLayout";
import { StorefrontShell } from "components/storefront/StorefrontShell";
import { DefaultItemPage } from "components/storefront/default/item/DefaultItemPage";
import { useItemController } from "components/storefront/useItemController";
import { PLATFORM_PALETTE } from "components/storefront/palette";
import { resolveStorefront } from "storefronts/registry";
import { storeSlugFromQuery } from "lib/store-context";
import type { GameDetailApi, StoreApi } from "components/store/types";
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
  isPreview: boolean;
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.query;
  const storeSlug = storeSlugFromQuery(context.query);
  const isPreview = context.query.preview === "1" && Boolean(storeSlug);
  const locale = context.locale === "pt-BR" ? "pt-BR" : "en";

  if (isPreview) {
    context.res.setHeader("Cache-Control", "private, no-store");
    context.res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

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
    if (storeSlug) {
      try {
        const storeResponse = await fetch(
          `${webserver.getOrigin()}/api/v1/stores/${storeSlug}${
            isPreview ? "?preview=1" : ""
          }`,
          { headers },
        );
        if (storeResponse.ok) {
          store = await storeResponse.json();
        } else if (isPreview) {
          return { notFound: true };
        }
      } catch {
        if (isPreview) return { notFound: true };
        store = null;
      }
    }

    return { props: { game, store, isPreview } };
  } catch (error) {
    console.error("Error fetching game via API:", error);
    throw error;
  }
};

export default function GameDetailsPage({
  game,
  store,
  isPreview,
}: ItemPageProps) {
  const { locale } = useI18n();
  const metadata = gameMetadata(game, locale);
  const controller = useItemController({
    gameSlug: game.slug,
    storeSlug: store?.slug,
    visitorPreview: isPreview,
  });

  // An outlet with a bespoke storefront but no bespoke product page still gets
  // its palette here, so the click from its catalogue does not jump back to
  // Manifold's colours mid-journey.
  const resolution = store ? resolveStorefront(store) : null;
  const custom = resolution?.kind === "custom" ? resolution.storefront : null;
  const outletDesign =
    store && !custom && hasCreatorPreset(store)
      ? resolveOutletDesign(store)
      : null;
  const ItemView = custom?.ItemPage ?? DefaultItemPage;

  const page = (
    <StorefrontShell
      store={store}
      palette={custom?.palette ?? outletDesign?.palette ?? PLATFORM_PALETTE}
      title={metadata.title}
      description={metadata.description}
      canonicalPath={`/item/${game.slug}`}
      socialImage={socialImageUrl("game", locale, game.slug)}
      socialImageAlt={
        locale === "pt-BR"
          ? `Arte de ${game.title}, de ${game.developer_name}, com a marca Manifold`
          : `${game.title} artwork by ${game.developer_name} with Manifold branding`
      }
      jsonLd={gameJsonLd(game, locale)}
      noIndex={isPreview}
    >
      <ItemView {...controller} game={game} store={store} />
    </StorefrontShell>
  );

  if (!store) {
    return <StoreHomeLayout>{page}</StoreHomeLayout>;
  }

  return (
    <StorefrontRouteLayout store={store} visitorPreview={isPreview}>
      {page}
    </StorefrontRouteLayout>
  );
}
