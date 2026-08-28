import {
  formatCatalogPrice,
  formatExternalPrice,
  isFree,
  currencySymbol,
} from "lib/price";

describe("catalog price formatting", () => {
  test("Should not classify a missing platform price as free", () => {
    expect(isFree({ price: null, display_price: null })).toBe(false);
  });

  test("Should show the informational Steam amount without a platform price", () => {
    const game = {
      purchase_mode: "STEAM_ONLY",
      price: null,
      display_price: null,
      external_offer: {
        provider: "STEAM" as const,
        amount: "19.99",
        currency: "USD",
      },
    };

    const expected = `${currencySymbol("USD")}19.99 on Steam`;
    expect(formatExternalPrice(game)).toBe(expected);
    expect(formatCatalogPrice(game)).toBe(expected);
  });

  test("Should identify an explicitly free Steam offer", () => {
    expect(
      formatCatalogPrice({
        purchase_mode: "STEAM_ONLY",
        price: null,
        external_offer: {
          provider: "STEAM",
          amount: "0.00",
          currency: null,
        },
      }),
    ).toBe("Free on Steam");
  });

  test("Should keep unavailable catalog entries distinct from free games", () => {
    expect(
      formatCatalogPrice({
        purchase_mode: "UNAVAILABLE",
        price: null,
        external_offer: null,
      }),
    ).toBe("Catalog only");
  });
});
