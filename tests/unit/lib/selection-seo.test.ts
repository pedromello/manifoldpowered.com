import {
  selectionMetadata,
  selectionJsonLd,
  selectionSocialImageUrl,
} from "lib/selection-seo";
import { serializeJsonLd } from "lib/seo";
import { selectionFixture } from "tests/unit/_fixtures/selection";

test("selection metadata describes the named collection and its outlet", () => {
  const data = selectionFixture();
  expect(selectionMetadata(data)).toEqual({
    title: "Weekend co-op — Example Outlet | Manifold",
    description: data.selection.description,
  });
  expect(selectionSocialImageUrl(data, "pt-BR")).toBe(
    "https://www.manifoldpowered.com/api/og/selection/example-outlet/weekend-coop?locale=pt-BR&v=1&design=7",
  );
});
test("selection structured data preserves the game order and localizes canonical links", () => {
  const data = selectionFixture();
  data.games.push({
    ...data.games[0],
    id: "game-2",
    slug: "repo",
    title: "R.E.P.O.",
  });
  const result = selectionJsonLd(data, "pt-BR");
  expect(result).toMatchObject({
    "@type": "CollectionPage",
    url: "https://www.manifoldpowered.com/pt-BR/store/example-outlet/selections/weekend-coop",
    creator: { name: "Example Outlet" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: 2,
      itemListElement: [
        { position: 1, item: { name: "PEAK" } },
        { position: 2, item: { name: "R.E.P.O." } },
      ],
    },
  });
});
test("creator text cannot break out of a JSON-LD script", () => {
  const data = selectionFixture();
  data.selection.title = "</script><script>alert(1)</script>";
  const serialized = serializeJsonLd(selectionJsonLd(data, "en"));
  expect(serialized).not.toContain("</script>");
  expect(serialized).toContain("\\u003c");
});
