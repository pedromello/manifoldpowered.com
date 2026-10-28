import {
  resolveCatalogOffer,
  EXTERNAL_OFFER_MAX_AGE_MS,
} from "lib/catalog-offer";

const now = Date.parse("2026-10-19T12:00:00Z");
const external = {
  price: null,
  purchase_mode: "NINTENDO_ONLY",
  external_offer: {
    provider: "NINTENDO" as const,
    amount: "95.70",
    original_amount: "145.00",
    discount_percent: 34,
    currency: "BRL",
    captured_at: new Date(now).toISOString(),
  },
};
test("preserves the regional provider percentage instead of browser rounding", () => {
  expect(resolveCatalogOffer(external, { now })).toMatchObject({
    state: "current",
    discount_percent: 34,
  });
});
test.each([-1, 0, 100, 101, 1.5, null])(
  "rejects invalid percentage %s",
  (discount_percent) => {
    expect(
      resolveCatalogOffer(
        {
          ...external,
          external_offer: { ...external.external_offer, discount_percent },
        },
        { now },
      ).discount_percent,
    ).toBeNull();
  },
);
test.each(["145.00", "150.00", "-1", "NaN", "1e2"])(
  "rejects incoherent amount %s",
  (amount) => {
    expect(
      resolveCatalogOffer(
        { ...external, external_offer: { ...external.external_offer, amount } },
        { now },
      ).discount_percent,
    ).toBeNull();
  },
);
test("removes stale offers from promotion eligibility", () => {
  expect(
    resolveCatalogOffer(external, { now: now + EXTERNAL_OFFER_MAX_AGE_MS + 1 }),
  ).toMatchObject({ state: "stale", discount_percent: null });
});
test.each([null, "invalid", new Date(now + 600_000).toISOString()])(
  "does not advertise an unknown capture",
  (captured_at) => {
    expect(
      resolveCatalogOffer(
        {
          ...external,
          external_offer: { ...external.external_offer, captured_at },
        },
        { now },
      ).state,
    ).toBe("unknown");
  },
);
test("supports a real100percent offer", () => {
  expect(
    resolveCatalogOffer(
      {
        ...external,
        external_offer: {
          ...external.external_offer,
          amount: "0.00",
          discount_percent: 100,
        },
      },
      { now },
    ).discount_percent,
  ).toBe(100);
});
test("never compares regional current prices to USD base values", () => {
  const game = {
    price: "10.00",
    base_price: "20.00",
    purchase_mode: "PLATFORM",
    display_price: {
      amount: "5.00",
      base_amount: null,
      currency: "BRL",
      symbol: "R$",
    },
  };
  expect(resolveCatalogOffer(game).discount_percent).toBeNull();
  expect(
    resolveCatalogOffer({
      ...game,
      display_price: { ...game.display_price, base_amount: "10.00" },
    }).discount_percent,
  ).toBe(50);
});
test("keeps large decimal strings exact", () => {
  expect(
    resolveCatalogOffer({
      price: "999999999999999999999999.00",
      base_price: "999999999999999999999999.01",
      purchase_mode: "PLATFORM",
    }).discount_percent,
  ).toBeNull();
});
