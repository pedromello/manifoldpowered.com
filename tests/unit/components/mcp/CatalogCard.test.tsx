import { renderToStaticMarkup } from "react-dom/server";
import { CatalogCard, CatalogSearchCards } from "components/mcp/CatalogCard";
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

describe("Manifold catalog card", () => {
  test("shows honest missing media/reviews and never a purchase or composer action", () => {
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
  test("renders stored video with controls, sample totals and escaped untrusted text", () => {
    const reviews: CatalogReviewsResult = {
      game,
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
      <CatalogCard
        game={{
          ...game,
          review_summary: {
            total: 12,
            positive: 9,
            negative: 3,
            source: "catalog_counters",
          },
          media: {
            images: ["https://shared.fastly.steamstatic.com/stored.jpg"],
            videos: [
              {
                url: "https://video.fastly.steamstatic.com/stored.mp4",
                kind: "file",
              },
            ],
          },
        }}
        locale="en"
        reviews={reviews}
        {...actions}
      />,
    );
    expect(html).toContain("12 catalog reviews");
    expect(html).toContain("1 comments on this page");
    expect(html).toContain("4 matching the filter");
    expect(html).toContain('controls=""');
    expect(html).not.toMatch(/autoplay|<script|<iframe/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("review-reference");
    expect(html).toContain("Next page");
  });
  test("empty search is honest, and loading disables selecting another game", () => {
    expect(
      renderToStaticMarkup(
        <CatalogSearchCards games={[]} locale="en" selectGame={jest.fn()} />,
      ),
    ).toContain("No games found.");
    expect(
      renderToStaticMarkup(
        <CatalogSearchCards
          games={[game]}
          locale="en"
          pending
          selectGame={jest.fn()}
        />,
      ),
    ).toContain('disabled=""');
  });
});
