import { GetServerSideProps } from "next";

import webserver from "infra/webserver";
import { StoreLayout } from "components/store/StoreLayout";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { StorefrontShell } from "components/storefront/StorefrontShell";
import { DefaultItemPage } from "components/storefront/default/item/DefaultItemPage";
import { useItemController } from "components/storefront/useItemController";
import { DEFAULT_PALETTE } from "components/storefront/palette";
import { resolveStorefront } from "storefronts/registry";
import { storeSlugFromQuery } from "lib/store-context";
import type { GameDetailApi, StoreApi } from "components/store/types";
import { useI18n } from "lib/i18n";
import { headersForInternalFetch } from "lib/internal-fetch";

type ItemPageProps = {
  game: GameDetailApi;
  /** The outlet this visit came through, or null for a direct visit. */
  store: StoreApi | null;
};

const PLATFORM_PALETTE = {
  bg: "#0b0812",
  surface: "#14101c",
  border: "rgba(255, 255, 255, 0.10)",
  fg: "#ffffff",
  muted: "rgba(255, 255, 255, 0.55)",
  accent: "#a78bfa",
  accentFg: "#0b0812",
} as const;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.query;
  const storeSlug = storeSlugFromQuery(context.query);

  // Forwarded because the price shown here is regional (models/region.ts).
  // Without it a Brazilian visitor saw BRL on the storefront list and USD on
  // this page for the same game.
  const headers = headersForInternalFetch(context.req.headers);

  try {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/items/games/${slug}`,
      { headers },
    );

    if (!response.ok) {
      return { notFound: true };
    }

    const game = await response.json();

    // `?store=` is visitor-supplied, so an unknown or malformed value must
    // degrade to an unattributed page rather than 404 a game that exists.
    let store: StoreApi | null = null;
    if (storeSlug) {
      try {
        const storeResponse = await fetch(
          `${webserver.getOrigin()}/api/v1/stores/${storeSlug}`,
          { headers },
        );
        if (storeResponse.ok) {
          store = await storeResponse.json();
        }
      } catch {
        store = null;
      }
    }

    return { props: { game, store } };
  } catch (error) {
    console.error("Error fetching game via API:", error);
    return { notFound: true };
  }
};

export default function GameDetailsPage({ game, store }: ItemPageProps) {
  const { t } = useI18n();
  const controller = useItemController({
    gameSlug: game.slug,
    storeSlug: store?.slug,
  });

  // An outlet with a bespoke storefront but no bespoke product page still gets
  // its palette here, so the click from its catalogue does not jump back to
  // Manifold's colours mid-journey.
  const custom = store ? resolveStorefront(store) : null;
  const ItemView = custom?.ItemPage ?? DefaultItemPage;

  const page = (
    <StorefrontShell
      store={store}
      palette={custom?.palette ?? (store ? DEFAULT_PALETTE : PLATFORM_PALETTE)}
      title={t("{title} | Manifold Outlets", { title: game.title })}
      description={game.description}
    >
      <ItemView {...controller} game={game} store={store} />
    </StorefrontShell>
  );

  if (!store) {
    return <StoreHomeLayout>{page}</StoreHomeLayout>;
  }

  return (
    <StoreLayout
      store={{ slug: store.slug, name: store.name, logo_url: store.logo_url }}
    >
      {page}
    </StoreLayout>
  );
}
