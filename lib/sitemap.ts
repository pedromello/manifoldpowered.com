import {
  canonicalUrl,
  languageAlternates,
  SITE_ORIGIN,
  xmlEscape,
} from "lib/seo";

export type SitemapEntry = {
  path: string;
  lastModified?: Date | string;
};

export function buildRobotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /api/og/",
    "Disallow: /api/",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.flatMap((entry) =>
    (["en", "pt-BR"] as const).map((locale) => {
      const alternates = languageAlternates(entry.path);
      const lastModified = entry.lastModified
        ? new Date(entry.lastModified).toISOString()
        : undefined;

      return [
        "  <url>",
        `    <loc>${xmlEscape(canonicalUrl(locale, entry.path))}</loc>`,
        lastModified ? `    <lastmod>${lastModified}</lastmod>` : null,
        ...Object.entries(alternates).map(
          ([language, href]) =>
            `    <xhtml:link rel="alternate" hreflang="${language}" href="${xmlEscape(href)}" />`,
        ),
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
