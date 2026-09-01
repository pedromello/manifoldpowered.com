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
  privatePage = false,
}: {
  locale: AppLocale;
  path: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  jsonLd?: JsonLd;
  /** Suppresses canonical, alternate and social projection for private HTML. */
  privatePage?: boolean;
}) {
  const canonical = canonicalUrl(locale, path);
  const alternates = languageAlternates(path);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      {!privatePage && <link rel="canonical" href={canonical} />}
      {!privatePage &&
        Object.entries(alternates).map(([language, href]) => (
          <link
            key={language}
            rel="alternate"
            hrefLang={language}
            href={href}
          />
        ))}

      {!privatePage && <meta property="og:type" content="website" />}
      {!privatePage && <meta property="og:site_name" content={SITE_NAME} />}
      {!privatePage && <meta property="og:title" content={title} />}
      {!privatePage && <meta property="og:description" content={description} />}
      {!privatePage && <meta property="og:url" content={canonical} />}
      {!privatePage && <meta property="og:locale" content={ogLocale(locale)} />}
      {!privatePage && (
        <meta
          property="og:locale:alternate"
          content={alternateOgLocale(locale)}
        />
      )}
      {!privatePage && image && <meta property="og:image" content={image} />}
      {!privatePage && image && (
        <meta property="og:image:secure_url" content={image} />
      )}
      {!privatePage && image && (
        <meta property="og:image:type" content="image/png" />
      )}
      {!privatePage && image && (
        <meta property="og:image:width" content={String(SOCIAL_IMAGE_WIDTH)} />
      )}
      {!privatePage && image && (
        <meta
          property="og:image:height"
          content={String(SOCIAL_IMAGE_HEIGHT)}
        />
      )}
      {!privatePage && image && imageAlt && (
        <meta property="og:image:alt" content={imageAlt} />
      )}

      {!privatePage && (
        <meta
          name="twitter:card"
          content={image ? "summary_large_image" : "summary"}
        />
      )}
      {!privatePage && <meta name="twitter:title" content={title} />}
      {!privatePage && (
        <meta name="twitter:description" content={description} />
      )}
      {!privatePage && image && <meta name="twitter:image" content={image} />}
      {!privatePage && image && imageAlt && (
        <meta name="twitter:image:alt" content={imageAlt} />
      )}

      {!privatePage && jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
    </Head>
  );
}
