import type { GetServerSideProps } from "next";
import Link from "next/link";
import { ProductPageEvent } from "components/analytics/ProductPageEvent";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import Head from "next/head";
import { resolveOutletDesign } from "components/storefront/presets/config";
import { paletteToCss } from "components/storefront/palette";
import { SeoHead } from "components/SeoHead";
import { GameArtwork } from "components/store/GameArtwork";
import { SelectionGames } from "components/store/SelectionGames";
import { FollowOutletButton } from "components/store/FollowOutletButton";
import { useI18n } from "lib/i18n";
import webserver from "infra/webserver";
import { headersForInternalFetch } from "lib/internal-fetch";
import { fetchPageData, PageDataRequestError } from "lib/page-data";
import {
  selectionMetadata,
  selectionJsonLd,
  selectionSocialImageUrl,
} from "lib/selection-seo";
import type { SelectionPageApi } from "lib/selection-client";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug, selectionSlug } = context.params ?? {};
  if (typeof slug !== "string" || typeof selectionSlug !== "string")
    return { notFound: true };
  const preview = context.query.preview === "1";
  if (preview) {
    context.res.setHeader("Cache-Control", "private, no-store");
    context.res.setHeader("X-Robots-Tag", "noindex, nofollow");
    context.res.setHeader("Vary", "Cookie");
  }
  const url = new URL(
    `/api/v1/stores/${encodeURIComponent(slug)}/selections/${encodeURIComponent(selectionSlug)}`,
    webserver.getOrigin(),
  );
  if (preview) url.searchParams.set("preview", "1");
  url.searchParams.set("locale", context.locale === "pt-BR" ? "pt-BR" : "en");
  let data: SelectionPageApi | null;
  try {
    data = await fetchPageData<SelectionPageApi>(url.href, {
      headers: headersForInternalFetch(context.req.headers),
    });
  } catch (error) {
    if (
      error instanceof PageDataRequestError &&
      [401, 403].includes(error.status)
    )
      return { notFound: true };
    throw error;
  }
  if (!data) return { notFound: true };
  return { props: { data, preview } };
};

export default function SelectionPage({
  data,
  preview,
}: {
  data: SelectionPageApi;
  preview: boolean;
}) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const { selection, outlet, games } = data;
  const metadata = selectionMetadata(data);
  const design = resolveOutletDesign({
    brand_tokens: outlet.brand_tokens,
    layout_preset: null,
  });
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <main className="min-h-screen bg-sf-bg px-4 py-6 pb-28 text-sf-fg sm:px-6 lg:px-10">
      <Head>
        <style
          key="selection-palette"
          dangerouslySetInnerHTML={{ __html: paletteToCss(design.palette) }}
        />
      </Head>
      <ProductPageEvent
        preview={preview}
        event={{
          name: "selection_viewed",
          target: {
            store_slug: outlet.slug,
            selection_slug: selection.slug,
            published_revision: selection.published_revision,
          },
          properties: { locale, entry_surface: "selection_page" },
        }}
      />
      <SeoHead
        locale={locale}
        path={selection.public_path}
        title={metadata.title}
        description={metadata.description}
        image={preview ? undefined : selectionSocialImageUrl(data, locale)}
        imageAlt={selection.title}
        jsonLd={preview ? undefined : selectionJsonLd(data, locale)}
        privatePage={preview}
      />
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/store/${outlet.slug}${preview ? "?preview=1" : ""}`}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-white/65"
        >
          <ArrowLeft size={16} />
          {outlet.name}
        </Link>
        {preview && (
          <p
            role="status"
            className="my-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100"
          >
            {t("Private selection preview. Draft changes are not public.")}
          </p>
        )}
        <header className="mt-3 grid overflow-hidden rounded-3xl border border-sf-border bg-sf-surface lg:grid-cols-[1.1fr_1fr]">
          <GameArtwork
            src={selection.cover_url}
            alt={selection.title}
            loading="eager"
            className="aspect-[16/10] lg:aspect-auto lg:min-h-96"
          />
          <div className="flex flex-col justify-center gap-5 p-6 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sf-accent">
              {t("Game selection")}
            </p>
            <h1 className="break-words text-3xl font-black sm:text-4xl">
              {selection.title}
            </h1>
            <Link
              href={`/store/${outlet.slug}${preview ? "?preview=1" : ""}`}
              className="flex items-center gap-3 font-bold"
            >
              {outlet.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={outlet.logo_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-full object-cover"
                />
              )}
              {outlet.name}
              <ExternalLink size={15} aria-hidden="true" />
            </Link>
            {!preview && (
              <div className="flex flex-wrap items-center gap-3">
                <FollowOutletButton
                  storeSlug={outlet.slug}
                  storeName={outlet.name}
                  variant="platform"
                />
                <button
                  onClick={copyLink}
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {t(copied ? "Link copied" : "Share selection")}
                </button>
              </div>
            )}
            {copyError && (
              <p role="alert" className="text-sm text-rose-200">
                {t(
                  "Copy the page address from your browser to share this selection.",
                )}
              </p>
            )}
          </div>
        </header>
        <p className="my-8 max-w-3xl whitespace-pre-line break-words text-base leading-8 text-sf-muted">
          {selection.description}
        </p>
        {selection.image_urls.length > 0 && (
          <section
            aria-label={t("Selection gallery")}
            className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {selection.image_urls.map((url) => (
              <GameArtwork
                key={url}
                src={url}
                className="aspect-video rounded-2xl"
              />
            ))}
          </section>
        )}
        <section aria-label={t("Games in this selection")}>
          {games.length ? (
            <SelectionGames
              games={games}
              outletSlug={outlet.slug}
              preview={preview}
            />
          ) : (
            <p className="rounded-xl border border-sf-border p-6 text-white/60">
              {t(
                "No games from this selection are currently available in your region.",
              )}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
SelectionPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
