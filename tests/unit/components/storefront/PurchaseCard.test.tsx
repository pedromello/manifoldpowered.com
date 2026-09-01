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
        visitorPreview
        wishlist={{
          count: 4,
          isWishlisted: false,
          isToggling: false,
          toggle: jest.fn(),
        }}
      />,
    );

    expect(markup).toContain("$19.90");
    expect(markup).toContain("Lantern Studio");
    expect(markup).toContain(
      "Purchases and account actions are disabled in preview.",
    );
    expect(markup).not.toContain("Buy now");
    expect(markup).not.toContain("Add to Library");
    expect(markup).not.toContain("View on Steam");
    expect(markup).not.toContain("Add to Wishlist");
    expect(markup).not.toContain("In Library");
  });
});
