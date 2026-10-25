import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Layers, Search } from "lucide-react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { SelectionCards } from "components/store/SelectionCards";
import { OutletPreviewBanner } from "components/storefront/OutletPreviewBanner";
import type { StoreApi } from "components/store/types";
import type { PaginationApi } from "components/Pagination";
import { resolveOutletDesign } from "components/storefront/presets/config";
import { paletteToCss } from "components/storefront/palette";
import { SeoHead } from "components/SeoHead";
import {
  selectionLibraryQuerySchema,
  type SelectionLibraryQuery,
  type SelectionSummary,
} from "contracts/outlet-selections";
import { selectionLibraryPath } from "lib/selection-library";
import { useI18n } from "lib/i18n";
import { localizedPath } from "lib/seo";
import { headersForInternalFetch } from "lib/internal-fetch";
import { fetchPageData, PageDataRequestError } from "lib/page-data";
import webserver from "infra/webserver";

type LibraryData = {
  selections: SelectionSummary[];
  pagination: PaginationApi;
};
type LibraryProps = {
  store: StoreApi;
  data: LibraryData;
  query: SelectionLibraryQuery;
  preview: boolean;
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const preview = context.query.preview === "1";
  if (preview) {
    context.res.setHeader("Cache-Control", "private, no-store");
    context.res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const vary = String(context.res.getHeader("Vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!vary.some((value) => value.toLowerCase() === "cookie"))
      vary.push("Cookie");
    context.res.setHeader("Vary", vary.join(", "));
  }
  const slug = context.params?.slug;
  const parsed = selectionLibraryQuerySchema.safeParse(context.query);
  if (typeof slug !== "string" || !parsed.success) return { notFound: true };
  const query = parsed.data;
  const locale = context.locale === "pt-BR" ? "pt-BR" : "en";
  const storeUrl = new URL(
    `/api/v1/stores/${encodeURIComponent(slug)}`,
    webserver.getOrigin(),
  );
  const listUrl = new URL(
    `/api/v1/stores/${encodeURIComponent(slug)}/selections`,
    webserver.getOrigin(),
  );
  listUrl.searchParams.set("q", query.q);
  listUrl.searchParams.set("order", query.order);
  listUrl.searchParams.set("page", String(query.page));
  listUrl.searchParams.set("limit", "6");
  listUrl.searchParams.set("locale", locale);
  if (preview) {
    storeUrl.searchParams.set("preview", "1");
    listUrl.searchParams.set("preview", "1");
  }
  const headers = headersForInternalFetch(context.req.headers);
  try {
    const [store, data] = await Promise.all([
      fetchPageData<StoreApi>(storeUrl.href, { headers }),
      fetchPageData<LibraryData>(listUrl.href, { headers }),
    ]);
    if (!store || !data) return { notFound: true };
    if (query.page > Math.max(1, data.pagination.pages)) {
      return {
        redirect: {
          destination: localizedPath(
            locale,
            selectionLibraryPath(slug, { ...query, page: 1 }, preview),
          ),
          permanent: false,
        },
      };
    }
    return { props: { store, data, query, preview } };
  } catch (error) {
    if (
      error instanceof PageDataRequestError &&
      [401, 403].includes(error.status)
    )
      return { notFound: true };
    throw error;
  }
};

export default function SelectionLibrary({
  store,
  data,
  query,
  preview,
}: LibraryProps) {
  const { t, locale } = useI18n();
  const design = resolveOutletDesign({
    layout_preset: store.layout_preset ?? null,
    brand_tokens: store.brand_tokens,
  });
  const pagePath = selectionLibraryPath(store.slug, query);
  const action = localizedPath(locale, selectionLibraryPath(store.slug));
  const returnPath = `/store/${encodeURIComponent(store.slug)}${preview ? "?preview=1" : ""}#outlet-selections`;
  const page = (value: number) =>
    selectionLibraryPath(store.slug, { ...query, page: value }, preview);
  return (
    <main className="min-h-screen bg-sf-bg px-4 pb-28 pt-6 text-sf-fg sm:px-6 lg:px-10">
      <Head>
        <style
          key="selection-library-palette"
          dangerouslySetInnerHTML={{ __html: paletteToCss(design.palette) }}
        />
      </Head>
      <SeoHead
        locale={locale}
        path={pagePath}
        title={`${t("Game selections")} — ${store.name}`}
        description={t("Explore all selections from {name}.", {
          name: store.name,
        })}
        privatePage={preview || Boolean(query.q)}
      />
      {preview && <OutletPreviewBanner storeSlug={store.slug} />}
      <div className="mx-auto max-w-[1380px]">
        <Link
          href={returnPath}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-sf-muted focus-visible:outline-2 focus-visible:outline-sf-accent"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t("Back to community")}
        </Link>
        <header className="mb-8 mt-5 flex items-center gap-4 sm:gap-6">
          {store.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logo_url}
              alt=""
              referrerPolicy="no-referrer"
              className="h-20 w-20 shrink-0 rounded-xl border border-sf-border bg-sf-surface object-contain p-1 sm:h-24 sm:w-24"
            />
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-black sm:text-4xl">
              <Layers className="hidden shrink-0 sm:block" aria-hidden="true" />
              {t("Game selections")}
            </h1>
            <p className="mt-2 break-words font-bold">{store.name}</p>
            <p className="mt-2 text-sm text-sf-muted">
              {t("Explore all the curations from this community.")}
            </p>
          </div>
        </header>
        <form
          key={`${query.q}:${query.order}`}
          action={action}
          method="get"
          className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          {preview && <input type="hidden" name="preview" value="1" />}
          <div className="relative min-w-0 flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sf-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={query.q}
              maxLength={200}
              aria-label={t("Search selections in this community")}
              placeholder={t("Search selections in this community")}
              className="min-h-11 w-full rounded-xl border border-sf-border bg-sf-surface py-3 pl-10 pr-3 text-sm outline-none focus:border-sf-accent"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              name="order"
              aria-label={t("Sort selections")}
              defaultValue={query.order}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-sf-border bg-sf-surface px-3 text-sm sm:flex-none"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="newest">{t("Newest")}</option>
              <option value="oldest">{t("Oldest")}</option>
              <option value="title_asc">{t("Title A–Z")}</option>
            </select>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-sf-accent px-4 text-sm font-bold text-sf-accent-fg"
            >
              {t("Search")}
            </button>
          </div>
        </form>
        <p role="status" className="mb-4 text-sm text-sf-muted">
          {t("{count} selections", { count: data.pagination.total })}
        </p>
        {data.selections.length ? (
          <SelectionCards
            selections={data.selections}
            preview={preview}
            libraryQuery={query}
          />
        ) : (
          <div className="rounded-2xl border border-sf-border bg-sf-surface p-8 text-sf-muted">
            <p>
              {t(
                query.q
                  ? "No selections match your search."
                  : "This community has not published any selections yet.",
              )}
            </p>
            {query.q && (
              <Link
                href={selectionLibraryPath(store.slug, {}, preview)}
                className="mt-4 inline-flex min-h-11 items-center font-bold text-sf-accent"
              >
                {t("Clear search")}
              </Link>
            )}
          </div>
        )}
        {data.pagination.pages > 1 && (
          <nav
            aria-label={t("Selection pages")}
            className="mt-8 flex items-center justify-center gap-4 text-sm"
          >
            {query.page > 1 ? (
              <Link
                href={page(query.page - 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sf-border px-3"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                {t("Previous")}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="p-3 text-sf-muted opacity-40"
              >
                {t("Previous")}
              </span>
            )}
            <span className="text-sf-muted">
              {t("Page {current} of {total}", {
                current: query.page,
                total: data.pagination.pages,
              })}
            </span>
            {query.page < data.pagination.pages ? (
              <Link
                href={page(query.page + 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sf-border px-3"
              >
                {t("Next")}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="p-3 text-sf-muted opacity-40"
              >
                {t("Next")}
              </span>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}

SelectionLibrary.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
