import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PlatformStorefrontHome } from "components/storefront/default/PlatformStorefrontHome";
import type { GameApi } from "components/store/types";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/form", () => ({
  __esModule: true,
  default: ({ children, action, ...props }) => (
    <form action={typeof action === "string" ? action : undefined} {...props}>
      {children}
    </form>
  ),
}));

const game: GameApi = {
  id: "game-1",
  slug: "test-game",
  title: "Test Game",
  description: "A shared-catalog game.",
  detailed_description: "A shared-catalog game.",
  launch_date: "2026-08-25T00:00:00.000Z",
  price: "19.90",
  developer_name: "Test Studio",
  tags: ["Strategy"],
  media: { screenshots: [], videos: [] },
  purchase_mode: "PLATFORM",
  external_offer: null,
  recommendation_reason: "A trusted editorial pick.",
  featured_source: "EDITORIAL",
};

function props(
  store: ComponentProps<typeof PlatformStorefrontHome>["store"],
): ComponentProps<typeof PlatformStorefrontHome> {
  const storeQuery = store ? `?store=${encodeURIComponent(store.slug)}` : "";

  return {
    store,
    isPreview: false,
    followControl: store ? (
      <button
        data-storefront="follow-outlet"
        aria-label={`Follow ${store.name}`}
      >
        Follow
      </button>
    ) : null,
    featured: [game],
    featuredMode: "EDITORIAL",
    isFeaturedLoading: false,
    games: [game],
    isLoading: false,
    currency: "USD",
    q: "",
    setQuery: jest.fn(),
    activeCategory: null,
    setCategory: jest.fn(),
    tags: [],
    toggleTag: jest.fn(),
    order: "newest",
    setOrder: jest.fn(),
    page: 1,
    setPage: jest.fn(),
    categories: ["For You", "Strategy"],
    itemHref: (slug) => `/item/${slug}${storeQuery}`,
    browseHref: () => (store ? `/store/${store.slug}` : "/store"),
    searchAction: store ? `/store/${store.slug}` : "/search",
    searchHiddenFields: {},
    showDiscover: !store,
  };
}

describe("PlatformStorefrontHome", () => {
  test("renders Outlet identity and functionality in the platform UI", () => {
    const markup = renderToStaticMarkup(
      <PlatformStorefrontHome
        {...props({
          id: "store-1",
          slug: "outlet-teste-1",
          name: "Outlet Teste 1",
          description: "Curadoria feita para esta comunidade.",
          logo_url: "https://example.com/outlet.png",
        })}
      />,
    );

    expect(markup).toContain("Outlet Teste 1");
    expect(markup).toContain("Curadoria feita para esta comunidade.");
    expect(markup).toContain("Featured in Outlet Teste 1");
    expect(markup).toContain("A trusted editorial pick.");
    expect(markup).toContain('data-storefront="follow-outlet"');
    expect(markup).toContain('data-storefront="search"');
    expect(markup).toContain('data-storefront="filters"');
    expect(markup).toContain('data-storefront="game-list"');
    expect(markup).toContain('href="/item/test-game?store=outlet-teste-1"');
    expect(markup).toContain('action="/store/outlet-teste-1"');
    expect(markup).toContain('placeholder="Search games in this Outlet..."');
    expect(markup).not.toContain(
      "Think Steam, but with creator-run storefronts.",
    );
  });

  test("keeps the platform homepage copy when no Outlet context exists", () => {
    const markup = renderToStaticMarkup(
      <PlatformStorefrontHome {...props(null)} />,
    );

    expect(markup).toContain("Think Steam, but with creator-run storefronts.");
    expect(markup).toContain('action="/search"');
    expect(markup).not.toContain('data-storefront="follow-outlet"');
  });

  test("renders a discounted Steam-only offer without a Steam suffix", () => {
    const steamGame: GameApi = {
      ...game,
      id: "steam-game-1",
      slug: "steam-only-game",
      price: null,
      base_price: null,
      display_price: null,
      discount_label: undefined,
      purchase_mode: "STEAM_ONLY",
      external_offer: {
        provider: "STEAM",
        amount: "19.99",
        original_amount: "29.99",
        discount_percent: 33,
        currency: "USD",
        url: "https://store.steampowered.com/app/123/",
        captured_at: "2026-08-28T00:00:00.000Z",
      },
    };
    const steamProps = props(null);
    steamProps.featured = [steamGame];
    steamProps.games = [steamGame];

    const markup = renderToStaticMarkup(
      <PlatformStorefrontHome {...steamProps} />,
    );

    expect(markup).toContain("$19.99");
    expect(markup).toContain("$29.99");
    expect(markup).toContain("-33%");
    expect(markup).toContain("background-color:#FFB400");
    expect(markup).not.toContain("bg-emerald-400");
    expect(markup).not.toContain("-33% OFF");
    expect(markup.toLowerCase()).not.toContain("on steam");
  });
});
