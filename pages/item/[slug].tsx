import { GetServerSideProps } from "next";

import webserver from "infra/webserver";
import { StoreLayout } from "components/store/StoreLayout";
import { DefaultItemPage } from "components/storefront/default/item/DefaultItemPage";
import { useItemController } from "components/storefront/useItemController";
import { storeSlugFromQuery } from "lib/store-context";
import type { GameDetailApi, StoreApi } from "components/store/types";

type ItemPageProps = {
  game: GameDetailApi;
  /** The outlet this visit came through, or null for a direct visit. */
  store: StoreApi | null;
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.query;
  const storeSlug = storeSlugFromQuery(context.query);

  // Forwarded because the price shown here is regional (models/region.ts).
  // Without it a Brazilian visitor saw BRL on the storefront list and USD on
  // this page for the same game.
  const headers: HeadersInit = {};
  if (context.req.headers.cookie) {
    headers.cookie = context.req.headers.cookie;
  }
  const country = context.req.headers["x-vercel-ip-country"];
  if (typeof country === "string") {
    headers["x-vercel-ip-country"] = country;
  }

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
  const controller = useItemController({
    gameSlug: game.slug,
    storeSlug: store?.slug,
  });

  return (
    <StoreLayout
      store={
        store
          ? { slug: store.slug, name: store.name, logo_url: store.logo_url }
          : undefined
      }
    >
      <DefaultItemPage {...controller} game={game} store={store} />
    </StoreLayout>
  );
}
