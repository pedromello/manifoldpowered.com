import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GameApi } from "components/store/types";
import { CreatorPresetStorefront } from "components/storefront/presets/CreatorPresetStorefront";
import {
  hasCreatorPreset,
  OUTLET_PALETTES,
  resolveOutletDesign,
} from "components/storefront/presets/config";
import type { StoreContext } from "components/storefront/types";
import type { StoreLayoutPreset } from "contracts/store-presentation";

type MockLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: unknown;
};

type MockFormProps = Omit<ComponentProps<"form">, "action"> & {
  action: unknown;
};

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: MockLinkProps) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/form", () => ({
  __esModule: true,
  default: ({ children, action, ...props }: MockFormProps) => (
    <form action={typeof action === "string" ? action : undefined} {...props}>
      {children}
    </form>
  ),
}));

const game: GameApi = {
  id: "game-1",
  slug: "signal-and-sky",
  title: "Signal & Sky",
  description: "A thoughtful cooperative adventure.",
  detailed_description: "A thoughtful cooperative adventure.",
  launch_date: "2026-08-25T00:00:00.000Z",
  price: "19.90",
  display_price: {
    amount: "19.90",
    base_amount: null,
    currency: "USD",
    symbol: "$",
  },
  developer_name: "Lantern Studio",
  tags: ["Adventure", "Co-op"],
  media: {
    banner: "https://example.com/game.jpg",
    screenshots: [],
    videos: [],
  },
  purchase_mode: "PLATFORM",
  external_offer: null,
  recommendation_reason: "A generous game to share with friends.",
  featured_source: "EDITORIAL",
};

function store(layout_preset: StoreLayoutPreset): StoreContext {
  return {
    id: "store-1",
    slug: "lantern-club",
    name: "Lantern Club",
    description: "Independent games, chosen with care.",
    logo_url: "https://example.com/logo.png",
    theme_key: null,
    layout_preset,
    tagline: "Small worlds, bright ideas.",
    cover_url: "https://example.com/cover.jpg",
    social_links: {
      website: "https://example.com/lantern",
      youtube: "https://youtube.com/@lantern",
    },
    brand_tokens: {
      palette: "ocean",
      typography: layout_preset === "editorial" ? "editorial" : "modern",
      shape: layout_preset === "community" ? "pill" : "soft",
    },
  };
}

function props(
  layoutPreset: StoreLayoutPreset,
): ComponentProps<typeof CreatorPresetStorefront> {
  const outlet = store(layoutPreset);
  return {
    store: outlet,
    isPreview: false,
    followControl: (
      <button data-storefront="follow-outlet">Follow Lantern Club</button>
    ),
    featured: [game],
    featuredMode: "EDITORIAL",
    isFeaturedLoading: false,
    featuredError: false,
    retryFeatured: () => undefined,
    games: [game],
    isLoading: false,
    catalogError: false,
    retryCatalog: () => undefined,
    pagination: { page: 1, limit: 12, total: 1, pages: 1 },
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
    categories: ["For You", "Adventure"],
    itemHref: (slug) => `/item/${slug}?store=${outlet.slug}`,
    browseHref: () => `/store/${outlet.slug}`,
    searchAction: `/store/${outlet.slug}`,
    searchHiddenFields: {},
  };
}

describe("CreatorPresetStorefront", () => {
  test.each([
    ["channel", "Featured games"],
    ["editorial", "The front page"],
    ["community", "Club picks"],
  ] as const)(
    "renders the structurally distinct %s preset",
    (layoutPreset, structuralHeading) => {
      const markup = renderToStaticMarkup(
        <CreatorPresetStorefront {...props(layoutPreset)} />,
      );

      expect(markup).toContain(`data-preset-layout="${layoutPreset}"`);
      expect(markup).toContain(structuralHeading);
      expect(markup).toContain("Small worlds, bright ideas.");
      expect(markup).toContain("Independent games, chosen with care.");
      expect(markup).toContain("https://example.com/cover.jpg");
      expect(markup).toContain("https://example.com/logo.png");
      expect(markup).toContain("https://example.com/lantern");
    },
  );

  test.each(["channel", "editorial", "community"] as const)(
    "%s preserves every storefront contract marker and attributed item href",
    (layoutPreset) => {
      const markup = renderToStaticMarkup(
        <CreatorPresetStorefront {...props(layoutPreset)} />,
      );

      expect(markup).toContain('data-storefront="follow-outlet"');
      expect(markup).toContain('data-storefront="search"');
      expect(markup).toContain('data-storefront="filters"');
      expect(markup).toContain('data-storefront="game-list"');
      expect(markup).toContain('data-storefront="game-link"');
      expect(markup).toContain(
        'href="/item/signal-and-sky?store=lantern-club"',
      );

      const itemLinks = [
        ...markup.matchAll(/href="([^"]*\/item\/[^"]+)"/g),
      ].map((match) => match[1]);
      expect(itemLinks.length).toBeGreaterThan(0);
      expect(
        itemLinks.every((href) => href.includes("store=lantern-club")),
      ).toBe(true);
    },
  );

  test("keeps tags and sort order in the server-rendered search form", () => {
    const filteredProps = props("channel");
    filteredProps.tags = ["Co-op", "Adventure"];
    filteredProps.order = "price_asc";
    const markup = renderToStaticMarkup(
      <CreatorPresetStorefront {...filteredProps} />,
    );

    expect(markup).toContain('name="tags" value="Co-op"');
    expect(markup).toContain('name="tags" value="Adventure"');
    expect(markup).toContain('name="order" value="price_asc"');
  });

  test("keeps draft preview context on search and attributed item links", () => {
    const previewProps = props("community");
    previewProps.searchHiddenFields = { preview: "1" };
    previewProps.itemHref = (gameSlug) =>
      `/item/${gameSlug}?store=lantern-club&preview=1`;

    const markup = renderToStaticMarkup(
      <CreatorPresetStorefront {...previewProps} />,
    );

    expect(markup).toContain('name="preview" value="1"');
    expect(markup).toContain(
      'href="/item/signal-and-sky?store=lantern-club&amp;preview=1"',
    );
  });

  test("drops unsafe social link protocols from legacy data", () => {
    const unsafeProps = props("community");
    unsafeProps.store = {
      ...unsafeProps.store,
      social_links: {
        website: "javascript:alert(1)",
        youtube: "data:text/html,unsafe",
        x: "https://x.com/lantern",
      },
    };
    const markup = renderToStaticMarkup(
      <CreatorPresetStorefront {...unsafeProps} />,
    );

    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("data:text/html");
    expect(markup).toContain("https://x.com/lantern");
  });

  test("renders retryable load failures distinctly from empty catalog states", () => {
    const failedProps = props("editorial");
    failedProps.featured = [];
    failedProps.games = [];
    failedProps.featuredError = true;
    failedProps.catalogError = true;

    const markup = renderToStaticMarkup(
      <CreatorPresetStorefront {...failedProps} />,
    );

    expect(markup).toContain("Featured games could not be loaded.");
    expect(markup).toContain("The catalog could not be loaded.");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("No games found.");
    expect(markup).not.toContain(
      "This Outlet is preparing its first featured picks.",
    );
  });

  test("does not present catalog results as Featured while Featured is loading", () => {
    const loadingProps = props("channel");
    loadingProps.featured = [];
    loadingProps.isFeaturedLoading = true;

    const markup = renderToStaticMarkup(
      <CreatorPresetStorefront {...loadingProps} />,
    );

    expect(markup).toContain("Preparing featured games…");
    expect(markup.match(/Signal &amp; Sky/g)).toHaveLength(1);
    expect(markup).toContain("motion-reduce:animate-none");
  });

  test("announces a Featured failure even if loading state briefly overlaps", () => {
    const failedProps = props("community");
    failedProps.featured = [];
    failedProps.featuredError = true;
    failedProps.isFeaturedLoading = true;

    const markup = renderToStaticMarkup(
      <CreatorPresetStorefront {...failedProps} />,
    );

    expect(markup).toContain("Featured games could not be loaded.");
    expect(markup).not.toContain("Preparing featured games…");
  });

  test("falls back to contract defaults and ignores theme_key", () => {
    const invalid = {
      ...store("channel"),
      theme_key: "neon-alley",
      layout_preset: "forged-layout",
      brand_tokens: {
        palette: "url(javascript:alert(1))",
        typography: "Comic Sans",
        shape: "9999px; color: red",
      },
    } as unknown as StoreContext;

    expect(resolveOutletDesign(invalid)).toEqual({
      preset: "channel",
      tokens: {
        palette: "manifold",
        typography: "modern",
        shape: "soft",
      },
      palette: OUTLET_PALETTES.manifold,
      themeKey: "preset:channel:manifold:modern:soft",
    });
  });

  test("keeps legacy standard Outlets on the classic layout until opt-in", () => {
    expect(hasCreatorPreset({ ...store("channel"), layout_preset: null })).toBe(
      false,
    );
    expect(hasCreatorPreset(store("channel"))).toBe(true);
  });
});

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error("Invalid test color");
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const values = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("OUTLET_PALETTES", () => {
  test.each(Object.values(OUTLET_PALETTES))(
    "$id palette keeps body, muted, and accent text at WCAG AA contrast",
    (palette) => {
      expect(contrastRatio(palette.fg, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.muted, palette.bg)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(palette.fg, palette.surface)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(palette.muted, palette.surface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.accent, palette.bg)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(palette.accent, palette.surface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.accentFg, palette.accent),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
