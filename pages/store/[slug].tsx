import Link from "next/link";
import useSWR from "swr";
import { GetServerSideProps } from "next";
import { Settings } from "lucide-react";

import webserver from "infra/webserver";
import { StorefrontRouteLayout } from "components/store/StorefrontRouteLayout";
import { Storefront } from "components/store/Storefront";
import type { StoreApi } from "components/store/types";
import { fetchJson } from "lib/api-client";
import { useI18n } from "lib/i18n";
import { headersForInternalFetch } from "lib/internal-fetch";

interface CurrentUser {
  id: string;
}

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

  const headers = headersForInternalFetch(context.req.headers);

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
  const { t } = useI18n();
  const { data: currentUser } = useSWR<CurrentUser>("/api/v1/user", fetchJson, {
    shouldRetryOnError: false,
  });

  return (
    <StorefrontRouteLayout store={store}>
      <Storefront
        featuredEndpoint={`/api/v1/stores/${store.slug}/featured`}
        listEndpoint={`/api/v1/stores/${store.slug}/search`}
        browsePath={`/store/${store.slug}`}
        searchPagePath={`/store/${store.slug}`}
        pageTitle={t("{name} | Manifold Outlets", { name: store.name })}
        metaDescription={
          store.description ||
          t("Explore {name}'s curated catalog on Manifold.", {
            name: store.name,
          })
        }
        store={store}
      />

      {currentUser?.id === store.owner_id && (
        <Link
          href={`/store/${store.slug}/manage`}
          aria-label={t("Manage {name}", { name: store.name })}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black uppercase tracking-wider text-black shadow-2xl transition-colors hover:bg-white/90 sm:right-6 sm:px-5 lg:bottom-6"
        >
          <Settings size={16} />
          {t("Manage Outlet")}
        </Link>
      )}
    </StorefrontRouteLayout>
  );
}
