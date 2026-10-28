import type { GetServerSideProps } from "next";

import game from "models/game";
import store from "models/store";
import storeSelection from "models/store_selection";
import { selectionPath } from "contracts/outlet-selections";
import { buildSitemapXml, type SitemapEntry } from "lib/sitemap";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [games, outlets, selections] = await Promise.all([
    game.findAllForSitemap(),
    store.findAllForSitemap(),
    storeSelection.sitemapEntries(),
  ]);
  const entries: SitemapEntry[] = [
    { path: "/store" },
    { path: "/about" },
    ...selections.map((selection) => ({
      path: selectionPath(selection.store_slug, selection.selection_slug),
      lastModified: selection.published_at,
    })),
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
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.write(buildSitemapXml(entries));
  res.end();

  return { props: {} };
};

export default function SitemapXml() {
  return null;
}
