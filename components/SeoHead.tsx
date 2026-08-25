import Head from "next/head";

import type { AppLocale } from "lib/locale";
import {
  alternateOgLocale,
  canonicalUrl,
  languageAlternates,
  ogLocale,
  serializeJsonLd,
  SITE_NAME,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  type JsonLd,
} from "lib/seo";

export function SeoHead({
  locale,
  path,
  title,
  description,
  image,
  imageAlt,
  jsonLd,
}: {
  locale: AppLocale;
  path: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  jsonLd?: JsonLd;
}) {
  const canonical = canonicalUrl(locale, path);
  const alternates = languageAlternates(path);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {Object.entries(alternates).map(([language, href]) => (
        <link key={language} rel="alternate" hrefLang={language} href={href} />
      ))}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:locale" content={ogLocale(locale)} />
      <meta
        property="og:locale:alternate"
        content={alternateOgLocale(locale)}
      />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content={String(SOCIAL_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(SOCIAL_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content={imageAlt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
    </Head>
  );
}
