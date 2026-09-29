import { renderToStaticMarkup } from "react-dom/server";

import { PurchaseCard } from "components/storefront/default/item/PurchaseCard";
import type { GameDetailApi } from "components/store/types";

jest.mock("next/router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const game: GameDetailApi = {
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
  media: { screenshots: [], videos: [] },
  purchase_mode: "PLATFORM",
  external_offer: null,
  meta_tags: {},
  social_links: {
    steam_page: "https://store.steampowered.com/app/123",
  },
};

describe("PurchaseCard draft preview", () => {
  test.each([false, true])(
    "Nintendo region, price and preview=%s",
    (isPreview) => {
      const markup = renderToStaticMarkup(
        <PurchaseCard
          game={{
            ...game,
            nintendo_nsuid: "70010000003208",
            claimable: false,
            price: null,
            purchase_mode: "NINTENDO_ONLY",
            ownership_status: "UNCLAIMED",
            social_links: {},
            external_offer: {
              provider: "NINTENDO",
              country: "BR",
              currency: "BRL",
              amount: "30.00",
              original_amount: "60.00",
              discount_percent: 50,
              captured_at: "2026-09-07T12:00:00Z",
              url: "https://www.nintendo.com/pt-br/store/products/test/",
            },
          }}
          isPreview={isPreview}
          isFreeGame={false}
          isInLibrary={false}
          isCheckingLibrary={false}
          isRedeeming={false}
          acquisitionError={null}
          onRedeem={jest.fn()}
          wishlist={{
            count: 0,
            isWishlisted: false,
            isToggling: false,
            toggle: jest.fn(),
          }}
        />,
      );
      expect(markup).toContain("Nintendo eShop Brazil");
      expect(markup).toContain("Reference price");
      expect(markup).not.toContain("Claim ownership");
      expect(markup).not.toContain("Buy now");
      expect(markup).not.toContain("Add to Library");
      expect(markup).not.toContain("Stay Connected");
      expect(
        markup.includes(
          'href="https://www.nintendo.com/pt-br/store/products/test/"',
        ),
      ).toBe(!isPreview);
    },
  );
  test("keeps price and product facts but removes acquisition and account controls", () => {
    const markup = renderToStaticMarkup(
      <PurchaseCard
        game={game}
        isFreeGame={false}
        isInLibrary={false}
        isCheckingLibrary={false}
        isRedeeming={false}
        acquisitionError={null}
        onRedeem={jest.fn()}
        isPreview
        wishlist={{
          count: 4,
          isWishlisted: false,
          isToggling: false,
          toggle: jest.fn(),
        }}
      />,
    );

    expect(markup).toContain("$19.90");
    expect(markup).toContain("Signal &amp; Sky");
    expect(markup.indexOf("Signal &amp; Sky")).toBeLessThan(
      markup.indexOf("$19.90"),
    );
    expect(markup).toContain("Lantern Studio");
    expect(markup).toContain("Purchasing is disabled in preview");
    expect(markup).toContain(
      "Open the published Outlet to test acquisition and attribution.",
    );
    expect(markup).not.toContain("Buy now");
    expect(markup).not.toContain("Add to Library");
    expect(markup).not.toContain("View on Steam");
    expect(markup).not.toContain("Add to Wishlist");
    expect(markup).not.toContain("In Library");
    expect(markup).not.toContain("Stay Connected");
  });
  test.each([false, true])(
    "social heading is present when visible links exist (preview=%s)",
    (isPreview) => {
      const markup = renderToStaticMarkup(
        <PurchaseCard
          game={{ ...game, social_links: { website: "https://example.test" } }}
          isPreview={isPreview}
          isFreeGame={false}
          isInLibrary={false}
          isCheckingLibrary={false}
          isRedeeming={false}
          acquisitionError={null}
          onRedeem={jest.fn()}
          wishlist={{
            count: 0,
            isWishlisted: false,
            isToggling: false,
            toggle: jest.fn(),
          }}
        />,
      );
      expect(markup).toContain("Stay Connected");
      expect(markup).toContain('href="https://example.test"');
    },
  );
});
