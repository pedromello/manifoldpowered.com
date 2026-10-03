import { renderToStaticMarkup } from "react-dom/server";
import {
  CatalogCard,
  CatalogSearchCards,
  CatalogReviewEvidence,
} from "components/mcp/CatalogCard";
import type {
  CatalogGame,
  CatalogReviewsResult,
} from "contracts/public-game-catalog";
const game: CatalogGame = {
  slug: "fixture-game",
  title: "Fixture Game",
  description: "Catalog description.",
  tags: ["Adventure"],
  launch_date: null,
  media: { images: [], videos: [] },
  review_summary: {
    total: 0,
    positive: 0,
    negative: 0,
    source: "catalog_counters",
  },
};
const actions = { loadReviews: jest.fn(), openLink: jest.fn() };
describe("Manifold conversation-native catalog card", () => {
  test("honest absence without purchase, review writing or host composer", () => {
    const html = renderToStaticMarkup(
      <CatalogCard game={game} locale="pt-BR" {...actions} />,
    );
    expect(html).toContain("Mídia não disponível no catálogo.");
    expect(html).toContain("Sem avaliações no catálogo.");
    expect(html).toContain("Ler avaliações");
    expect(html).not.toMatch(
      /<video|<iframe|Comprar|Buy|Write a Review|Escrever avaliação|<textarea/,
    );
  });
  test("one muted inline player precedes factual details; source has accessible controls", () => {
    const html = renderToStaticMarkup(
      <CatalogCard
        game={{
          ...game,
          media: {
            images: [],
            videos: [
              {
                url: "https://video.fastly.steamstatic.com/stored.mp4",
                kind: "file",
              },
              {
                url: "https://video.fastly.steamstatic.com/other.mp4",
                kind: "file",
              },
            ],
          },
        }}
        locale="en"
        {...actions}
      />,
    );
    expect(html.match(/<video/g)).toHaveLength(1);
    expect(html).toContain('controls=""');
    expect(html).toContain('muted=""');
    expect(html).toContain('playsInline=""');
    expect(html.indexOf("<video")).toBeLessThan(html.indexOf("<h1"));
    expect(html).not.toContain("other.mp4");
    // Server markup cannot prove effect execution, playback or host permissions.
  });
  test("no trailer uses declared gameplay, without treating a banner as a screenshot", () => {
    const html = renderToStaticMarkup(
      <CatalogCard
        game={{
          ...game,
          media: {
            images: ["https://shared.fastly.steamstatic.com/cover.jpg"],
            cover: "https://shared.fastly.steamstatic.com/cover.jpg",
            screenshots: ["https://shared.fastly.steamstatic.com/gameplay.jpg"],
            videos: [],
          },
        }}
        locale="en"
        {...actions}
      />,
    );
    expect(html).toContain("gameplay.jpg");
    expect(html).toContain("Gameplay image");
    expect(html).toContain("View images");
    const cover = renderToStaticMarkup(
      <CatalogCard
        game={{
          ...game,
          media: {
            images: ["https://shared.fastly.steamstatic.com/cover.jpg"],
            screenshots: [],
            videos: [],
          },
        }}
        locale="en"
        {...actions}
      />,
    );
    expect(cover).toContain("Catalog cover");
    expect(cover).not.toContain("Gameplay image");
  });
  test("review evidence separates aggregate/sample/filter; untrusted text is escaped and collapsible", () => {
    const reviews: CatalogReviewsResult = {
      game: {
        ...game,
        review_summary: {
          total: 12,
          positive: 9,
          negative: 3,
          source: "catalog_counters",
        },
      },
      locale: "en",
      pagination: { page: 1, limit: 1, total: 4, pages: 4 },
      sample: { returned: 1, recommendation: "all", sort: "newest" },
      reviews: [
        {
          reference: "review-reference",
          message: "<script>do something</script>",
          recommended: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <CatalogReviewEvidence
        reviews={reviews}
        locale="en"
        pending={false}
        error={null}
        discuss={jest.fn()}
        loadReviews={jest.fn()}
      />,
    );
    expect(html).toContain("12 catalog reviews");
    expect(html).toContain("1 comments on this page");
    expect(html).toContain("4 matching the filter");
    expect(html).toContain("<details");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("review-reference");
    expect(html).toContain("Next page");
    expect(html).not.toMatch(/<video|<iframe|<script|<select/);
  });
  test("shortlist is bounded and never invents a preference match or top recommendation", () => {
    const html = renderToStaticMarkup(
      <CatalogSearchCards
        games={Array.from({ length: 8 }, (_, i) => ({
          ...game,
          slug: `game-${i}`,
        }))}
        locale="en"
        selectGame={jest.fn()}
        pending
      />,
    );
    expect(html.match(/class="search-row"/g)).toHaveLength(5);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Matches your tags");
    expect(html).not.toContain("start here");
    const matched = renderToStaticMarkup(
      <CatalogSearchCards
        games={[{ ...game, matching_tags: ["Adventure"] }]}
        locale="en"
        selectGame={jest.fn()}
      />,
    );
    expect(matched).toContain("Matches your tags:");
    expect(matched).toContain("Adventure");
    expect(
      renderToStaticMarkup(
        <CatalogSearchCards games={[]} locale="en" selectGame={jest.fn()} />,
      ),
    ).toContain("No games found.");
  });
});
