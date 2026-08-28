import type { GetServerSideProps } from "next";

import game from "models/game";
import store from "models/store";
import { buildSitemapXml, type SitemapEntry } from "lib/sitemap";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [games, outlets] = await Promise.all([
    game.findAllForSitemap(),
    store.findAllForSitemap(),
  ]);
  const entries: SitemapEntry[] = [
    { path: "/store" },
    { path: "/about" },
    ...outlets.map((outlet) => ({
      path: `/store/${outlet.slug}`,
      lastModified: outlet.updated_at,
    })),
    ...games.map((item) => ({
      path: `/item/${item.slug}`,
      lastModified: item.updated_at,
    })),
  ];

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.write(buildSitemapXml(entries));
  res.end();

  return { props: {} };
};

export default function SitemapXml() {
  return null;
}
