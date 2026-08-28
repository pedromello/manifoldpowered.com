import type { GameDetailApi, StoreApi } from "components/store/types";
import {
  canonicalUrl,
  cleanMetadataText,
  gameJsonLd,
  gameMetadata,
  homeMetadata,
  isNoIndexRoute,
  languageAlternates,
  outletMetadata,
  serializeJsonLd,
  socialImageUrl,
} from "lib/seo";

const store: StoreApi = {
  id: "store-1",
  slug: "careful-curator",
  name: "Careful Curator",
  description: "  Hand-picked\n games for thoughtful players.  ",
  logo_url: null,
  owner_id: "owner-1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const game: GameDetailApi = {
  id: "game-1",
  slug: "signal-garden",
  title: "Signal Garden",
  description: "Build a strange garden from radio signals.",
  detailed_description: "Long description",
  launch_date: "2026-01-01T00:00:00.000Z",
  price: "19.99",
  base_price: "24.99",
  display_price: {
    amount: "19.99",
    base_amount: "24.99",
    currency: "USD",
    symbol: "$",
  },
  discount_label: "-20%",
  developer_name: "Quiet Frequency",
  publisher_name: "Quiet Frequency",
  tags: ["Indie", "Simulation"],
  media: {
    banner: "https://example.test/banner.jpg",
    screenshots: [],
    videos: [],
  },
  meta_tags: { platforms: ["Windows", "Linux"] },
  social_links: {},
  purchase_mode: "PLATFORM",
  external_offer: null,
};

describe("SEO helpers", () => {
  test("normalizes controls and truncates on a readable boundary", () => {
    const value = cleanMetadataText(
      "  A title\nwith\tcontrols and many words that should not overflow  ",
      38,
    );

    expect(value).toBe("A title with controls and many words…");
    expect(value.length).toBeLessThanOrEqual(38);
  });

  test("builds real localized canonicals and reciprocal alternates", () => {
    expect(canonicalUrl("en", "/item/signal-garden")).toBe(
      "https://www.manifoldpowered.com/item/signal-garden",
    );
    expect(canonicalUrl("pt-BR", "/item/signal-garden")).toBe(
      "https://www.manifoldpowered.com/pt-BR/item/signal-garden",
    );
    expect(languageAlternates("/store")).toEqual({
      en: "https://www.manifoldpowered.com/store",
      "pt-BR": "https://www.manifoldpowered.com/pt-BR/store",
      "x-default": "https://www.manifoldpowered.com/store",
    });
  });

  test("uses distinct localized patterns for home, Outlet, and game", () => {
    expect(homeMetadata("en").title).toContain("creator-run Outlets");
    expect(homeMetadata("pt-BR").title).toContain("Outlets de criadores");
    expect(outletMetadata(store, "en")).toEqual({
      title: "Careful Curator — Curated games on Manifold",
      description: "Hand-picked games for thoughtful players.",
    });
    expect(gameMetadata(game, "en")).toEqual({
      title: "Signal Garden by Quiet Frequency — Manifold",
      description: "Build a strange garden from radio signals. · -20% · $19.99",
      commercial: "-20% · $19.99",
    });
    expect(outletMetadata({ ...store, description: "   " }, "en")).toEqual({
      title: "Careful Curator — Curated games on Manifold",
      description:
        "Explore Careful Curator's game selection in Manifold's shared catalog.",
    });
    expect(
      gameMetadata({ ...game, description: "", display_price: null }, "en")
        .description,
    ).toContain("available on Manifold");
    expect(
      gameMetadata(
        { ...game, display_price: { ...game.display_price!, amount: "0" } },
        "en",
      ).commercial,
    ).toBe("Free");
    expect(
      gameMetadata(
        {
          ...game,
          display_price: {
            amount: "49.90",
            base_amount: null,
            currency: "BRL",
            symbol: "R$",
          },
        },
        "pt-BR",
      ).commercial,
    ).toBe("R$49.90");
  });

  test("uses a safe content-specific social image URL", () => {
    expect(socialImageUrl("outlet", "pt-BR", "careful curator")).toBe(
      "https://www.manifoldpowered.com/api/og/outlet/careful%20curator?locale=pt-BR",
    );
  });

  test("only emits an Offer from real regional price data", () => {
    const priced = gameJsonLd(game, "en") as Record<string, unknown>;
    expect(priced["@type"]).toEqual(["VideoGame", "Product"]);
    expect(priced.offers).toEqual({
      "@type": "Offer",
      price: "19.99",
      priceCurrency: "USD",
      url: "https://www.manifoldpowered.com/item/signal-garden",
    });

    const unpriced = gameJsonLd(
      { ...game, display_price: null },
      "en",
    ) as Record<string, unknown>;
    expect(unpriced).not.toHaveProperty("offers");
    expect(unpriced["@type"]).toBe("VideoGame");
    expect(unpriced).not.toHaveProperty("aggregateRating");
  });

  test("escapes script-breaking markup in JSON-LD", () => {
    expect(
      serializeJsonLd({ name: "</script><script>alert(1)</script>" }),
    ).toBe('{"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}');
  });

  test.each([
    "/backoffice/users",
    "/library",
    "/login",
    "/search",
    "/signup/activate/[activation_token]",
    "/store/[slug]/manage",
    "/studio/[slug]",
  ])("marks private route %s as noindex", (pathname) => {
    expect(isNoIndexRoute(pathname)).toBe(true);
  });

  test.each(["/store", "/store/[slug]", "/item/[slug]", "/about"])(
    "keeps public route %s indexable",
    (pathname) => {
      expect(isNoIndexRoute(pathname)).toBe(false);
    },
  );
});
