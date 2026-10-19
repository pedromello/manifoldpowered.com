import type { ExternalPricedItem, PricedItem } from "lib/price";

export const EXTERNAL_OFFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export type CatalogOffer = {
  state: "current" | "stale" | "unknown" | "unavailable";
  discount_percent: number | null;
  captured_at: string | null;
};
export type CatalogPriceInput = PricedItem &
  ExternalPricedItem & {
    purchase_mode: string;
    catalog_offer?: CatalogOffer;
    external_offer?: ExternalPricedItem["external_offer"] & {
      captured_at?: string | null;
    };
  };

// Decimal strings stay exact; this is product-price comparison, not floating
// point currency arithmetic. Inputs outside the bounded money contract fail shut.
function decimal(value: string | null | undefined): bigint | null {
  if (!value || !/^\d{1,24}(?:\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(8, "0"));
}

export function resolveCatalogOffer(
  game: CatalogPriceInput,
  { now = Date.now(), maxAgeMs = EXTERNAL_OFFER_MAX_AGE_MS } = {},
): CatalogOffer {
  const external = ["STEAM_ONLY", "NINTENDO_ONLY"].includes(game.purchase_mode);
  const offer = game.external_offer;
  const amount = decimal(
    external ? offer?.amount : (game.display_price?.amount ?? game.price),
  );
  const original = decimal(
    external
      ? offer?.original_amount
      : game.display_price
        ? game.display_price.base_amount
        : game.base_price,
  );
  const capturedAt = external ? (offer?.captured_at ?? null) : null;
  const missing =
    amount === null ||
    (external && !offer?.currency) ||
    !["STEAM_ONLY", "NINTENDO_ONLY", "PLATFORM"].includes(game.purchase_mode);
  if (missing)
    return {
      state: "unavailable",
      discount_percent: null,
      captured_at: capturedAt,
    };
  const captured = capturedAt ? Date.parse(capturedAt) : NaN;
  const state: CatalogOffer["state"] = !external
    ? "current"
    : !Number.isFinite(captured) || captured > now + 300_000
      ? "unknown"
      : now - captured > maxAgeMs
        ? "stale"
        : "current";
  const coherent =
    original !== null &&
    original > BigInt(0) &&
    amount >= BigInt(0) &&
    amount < original;
  const percent = external
    ? offer?.discount_percent
    : coherent
      ? Number(((original - amount) * BigInt(100)) / original)
      : null;
  const valid =
    state === "current" &&
    coherent &&
    Number.isInteger(percent) &&
    percent > 0 &&
    percent <= 100;
  return {
    state,
    discount_percent: valid ? percent : null,
    captured_at: capturedAt,
  };
}

export function catalogOffer(game: CatalogPriceInput): CatalogOffer {
  return game.catalog_offer ?? resolveCatalogOffer(game);
}
