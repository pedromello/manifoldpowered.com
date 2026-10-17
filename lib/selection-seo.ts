import type { SelectionPageApi } from "lib/selection-client";
import type { AppLocale } from "lib/locale";
import {
  canonicalUrl,
  cleanMetadataText,
  SITE_ORIGIN,
  type JsonLd,
} from "lib/seo";

export function selectionMetadata(data: SelectionPageApi) {
  return {
    title: cleanMetadataText(
      `${data.selection.title} — ${data.outlet.name} | Manifold`,
      65,
    ),
    description: cleanMetadataText(data.selection.description, 170),
  };
}

export function selectionSocialImageUrl(
  data: SelectionPageApi,
  locale: AppLocale,
) {
  const url = new URL(
    `/api/og/selection/${encodeURIComponent(data.outlet.slug)}/${encodeURIComponent(data.selection.slug)}`,
    SITE_ORIGIN,
  );
  url.searchParams.set("locale", locale);
  url.searchParams.set("v", String(data.selection.published_revision));
  return url.href;
}

export function selectionJsonLd(
  data: SelectionPageApi,
  locale: AppLocale,
): JsonLd {
  const url = canonicalUrl(locale, data.selection.public_path);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#selection`,
    url,
    name: data.selection.title,
    description: cleanMetadataText(data.selection.description, 300),
    inLanguage: locale,
    image: selectionSocialImageUrl(data, locale),
    creator: {
      "@type": "Organization",
      name: data.outlet.name,
      url: canonicalUrl(locale, `/store/${data.outlet.slug}`),
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: data.games.length,
      itemListElement: data.games.map((game, position) => ({
        "@type": "ListItem",
        position: position + 1,
        item: {
          "@type": "VideoGame",
          name: game.title,
          url: canonicalUrl(locale, `/item/${game.slug}`),
        },
      })),
    },
  };
}
