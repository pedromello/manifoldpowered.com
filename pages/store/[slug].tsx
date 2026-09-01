import Link from "next/link";
import useSWR from "swr";
import { GetServerSideProps } from "next";
import { Settings } from "lucide-react";

import webserver from "infra/webserver";
import { StorefrontRouteLayout } from "components/store/StorefrontRouteLayout";
import { Storefront } from "components/store/Storefront";
import { storeContextFromApi, type StoreApi } from "components/store/types";
import { fetchJson } from "lib/api-client";
import { useI18n } from "lib/i18n";
import { headersForInternalFetch } from "lib/internal-fetch";
import { outletJsonLd, outletMetadata, socialImageUrl } from "lib/seo";
import { fetchPageData } from "lib/page-data";

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
  const slug = Array.isArray(context.query.slug)
    ? context.query.slug[0]
    : context.query.slug;
  const previewRequested = context.query.preview === "1";

  if (previewRequested) {
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
  if (!slug) return { notFound: true };

  const headers = headersForInternalFetch(context.req.headers);

  try {
    const storeUrl = new URL(
      `/api/v1/stores/${encodeURIComponent(slug)}`,
      webserver.getOrigin(),
    );
    if (previewRequested) storeUrl.searchParams.set("preview", "1");

    const store = await fetchPageData<StoreApi>(storeUrl.toString(), {
      headers,
    });

    if (!store) return { notFound: true };

    const isPreview = previewRequested;
    if (store.status === "DRAFT" && !isPreview) {
      return { notFound: true };
    }

    return { props: { store, isPreview } };
  } catch (error) {
    console.error("Error fetching outlet via API:", error);
    throw error;
  }
};

export default function StorePage({
  store,
  isPreview,
}: {
  store: StoreApi;
  isPreview: boolean;
}) {
  const { locale, t } = useI18n();
  const metadata = outletMetadata(store, locale);
  const viewStore = storeContextFromApi(store);
  const { data: currentUser } = useSWR<CurrentUser>(
    isPreview ? null : "/api/v1/user",
    fetchJson,
    { shouldRetryOnError: false },
  );

  return (
    <StorefrontRouteLayout store={viewStore} visitorPreview={isPreview}>
      <Storefront
        featuredEndpoint={`/api/v1/stores/${store.slug}/featured`}
        listEndpoint={`/api/v1/stores/${store.slug}/search`}
        browsePath={`/store/${store.slug}`}
        searchPagePath={`/store/${store.slug}`}
        pageTitle={metadata.title}
        metaDescription={metadata.description}
        canonicalPath={`/store/${store.slug}`}
        socialImage={
          isPreview
            ? undefined
            : socialImageUrl("outlet", locale, store.slug, store.published_at)
        }
        socialImageAlt={
          isPreview
            ? undefined
            : locale === "pt-BR"
              ? `Seleção de jogos da Outlet ${store.name}, com a marca Manifold`
              : `${store.name}'s game selection with Manifold branding`
        }
        jsonLd={isPreview ? undefined : outletJsonLd(store, locale)}
        store={viewStore}
        isPreview={isPreview}
      />

      {!isPreview && currentUser?.id === store.owner_id && (
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
