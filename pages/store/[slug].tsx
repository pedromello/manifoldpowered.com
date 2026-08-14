import Link from "next/link";
import useSWR from "swr";
import { GetServerSideProps } from "next";
import { Settings } from "lucide-react";

import webserver from "infra/webserver";
import { StoreLayout } from "components/store/StoreLayout";
import { Storefront } from "components/store/Storefront";
import type { StoreApi } from "components/store/types";

interface CurrentUser {
  id: string;
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

/**
 * Resolved on the server rather than through SWR in the browser.
 *
 * Client-fetching the outlet meant a full-screen spinner on every first paint,
 * a "not found" rendered as a 200, and no title or OG tags for a crawler — an
 * outlet was effectively invisible to search. It also makes per-outlet theming
 * possible without a flash, since the theme is known before the first byte.
 *
 * The visitor's country header is forwarded because the storefront's prices are
 * regional (models/region.ts); dropping it here would make a server-rendered
 * price disagree with the client-fetched list on the same page.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.query;

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
      `${webserver.getOrigin()}/api/v1/stores/${slug}`,
      { headers },
    );

    if (!response.ok) {
      return { notFound: true };
    }

    return { props: { store: await response.json() } };
  } catch (error) {
    console.error("Error fetching outlet via API:", error);
    return { notFound: true };
  }
};

export default function StorePage({ store }: { store: StoreApi }) {
  const { data: currentUser } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );

  return (
    <StoreLayout
      store={{
        slug: store.slug,
        name: store.name,
        logo_url: store.logo_url,
      }}
    >
      <Storefront
        featuredEndpoint={`/api/v1/stores/${store.slug}/featured`}
        listEndpoint={`/api/v1/stores/${store.slug}/search`}
        browsePath={`/store/${store.slug}`}
        searchPagePath={`/store/${store.slug}`}
        pageTitle={`${store.name} | Manifold Outlets`}
        metaDescription={
          store.description ||
          `Explore ${store.name}'s curated catalog on Manifold.`
        }
        heading={store.name}
        store={store}
      />

      {currentUser?.id === store.owner_id && (
        <Link
          href={`/store/${store.slug}/manage`}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-black font-black text-sm uppercase tracking-wider shadow-2xl hover:bg-white/90 transition-colors"
        >
          <Settings size={16} />
          Manage Outlet
        </Link>
      )}
    </StoreLayout>
  );
}
