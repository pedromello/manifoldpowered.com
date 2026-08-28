import { buildRobotsTxt, buildSitemapXml } from "lib/sitemap";

describe("crawler files", () => {
  test("robots allows noindex pages to be crawled, protects APIs, and advertises sitemap", () => {
    const robots = buildRobotsTxt();

    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Allow: /api/og/");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).not.toContain("Disallow: /backoffice");
    expect(robots).toContain(
      "Sitemap: https://www.manifoldpowered.com/sitemap.xml",
    );
    expect(robots).not.toContain("Disallow: /item");
  });

  test("sitemap emits absolute localized URLs with reciprocal hreflang", () => {
    const sitemap = buildSitemapXml([
      {
        path: "/item/a&b",
        lastModified: "2026-08-25T12:00:00.000Z",
      },
    ]);

    expect(sitemap).toContain(
      "<loc>https://www.manifoldpowered.com/item/a&amp;b</loc>",
    );
    expect(sitemap).toContain(
      "<loc>https://www.manifoldpowered.com/pt-BR/item/a&amp;b</loc>",
    );
    expect(sitemap).toContain('hreflang="en"');
    expect(sitemap).toContain('hreflang="pt-BR"');
    expect(sitemap).toContain('hreflang="x-default"');
    expect(sitemap).toContain("<lastmod>2026-08-25T12:00:00.000Z</lastmod>");
  });
});
