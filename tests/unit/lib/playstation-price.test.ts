import { resolveCatalogOffer } from "lib/catalog-offer";
import { formatCatalogPrice, isCatalogFree } from "lib/price";
const now = Date.now();
const game = {
  price: null,
  purchase_mode: "PLAYSTATION_ONLY",
  external_offer: {
    provider: "PLAYSTATION" as const,
    amount: "10.00",
    original_amount: "20.00",
    currency: "BRL",
    discount_percent: 50,
    captured_at: new Date(now).toISOString(),
    expires_at: new Date(now + 10000).toISOString(),
  },
};
test("shows the PlayStation regional reference price", () =>
  expect(formatCatalogPrice(game)).toBe("R$10,00"));
test("expires a promotion even when its capture is fresh", () => {
  expect(resolveCatalogOffer(game, { now })).toMatchObject({
    state: "current",
    discount_percent: 50,
  });
  expect(resolveCatalogOffer(game, { now: now + 10001 })).toMatchObject({
    state: "stale",
    discount_percent: null,
  });
});
test("does not treat an unavailable PlayStation price as free", () => {
  const unknown = { ...game, external_offer: null };
  expect(isCatalogFree(unknown)).toBe(false);
  expect(resolveCatalogOffer(unknown).state).toBe("unavailable");
  expect(formatCatalogPrice(unknown)).toBe("PlayStation Store");
});
