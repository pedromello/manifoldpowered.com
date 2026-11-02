import steam from "infra/steam";
import nintendo from "infra/nintendo";
import playstation from "infra/playstation";
import { NotFoundError, ValidationError } from "infra/errors";
import { parseNintendoUrl } from "lib/nintendo";
import { parsePlayStationUrl } from "lib/playstation";
import type {
  CollectedPrice,
  PriceCountry,
  PriceProvider,
} from "lib/price_refresh";

export interface PriceReference {
  provider: PriceProvider;
  country: PriceCountry;
  external_id: string;
  url: string | null;
}

/** Reuses provider parsers, but deliberately never imports metadata or creates games. */
export async function collectPrice(
  ref: PriceReference,
): Promise<CollectedPrice | null> {
  const captured_at = new Date();
  const currency = ref.country === "BR" ? "BRL" : "USD";
  let value: CollectedPrice;
  if (ref.provider === "STEAM") {
    if (!/^\d+$/.test(ref.external_id))
      throw new ValidationError({ message: "Invalid Steam identity" });
    const response = await steam.fetchAppDetails(
      ref.external_id,
      ref.country.toLowerCase(),
      ref.country === "BR" ? "brazilian" : "english",
    );
    if (!response?.success || !response.data)
      throw new NotFoundError({ message: "Steam product not found" });
    const data = response.data;
    if (!data.is_free && !data.price_overview) return null;
    value = {
      currency: data.price_overview?.currency ?? currency,
      amount: String(data.is_free ? 0 : data.price_overview.final / 100),
      original_amount: String(
        data.is_free ? 0 : data.price_overview.initial / 100,
      ),
      discount_percent: data.is_free
        ? 0
        : (data.price_overview.discount_percent ?? 0),
      expires_at: null,
      url: `https://store.steampowered.com/app/${ref.external_id}/`,
      captured_at,
    };
  } else if (ref.provider === "NINTENDO") {
    const parsed = ref.url && parseNintendoUrl(ref.url);
    if (!parsed)
      throw new ValidationError({
        message: "Missing Nintendo product reference",
      });
    const product = await nintendo.fetchProduct(parsed.slug, ref.country);
    if (product.nsuid !== ref.external_id)
      throw new ValidationError({ message: "Nintendo edition mismatch" });
    if (!product.prices) return null;
    const { finalPrice, regularPrice } = product.prices;
    value = {
      currency: product.prices.currency,
      amount: String(finalPrice),
      original_amount: String(regularPrice),
      discount_percent:
        regularPrice > 0
          ? Math.round((1 - finalPrice / regularPrice) * 100)
          : 0,
      expires_at: null,
      url: product.url,
      captured_at,
    };
  } else {
    const product = await playstation.fetchProduct(
      ref.external_id,
      ref.country,
    );
    if (
      product.id !== ref.external_id ||
      parsePlayStationUrl(product.url)?.productId !== ref.external_id
    )
      throw new ValidationError({ message: "PlayStation edition mismatch" });
    if (!product.prices) return null;
    value = { ...product.prices, currency, url: product.url, captured_at };
  }
  const amount = Number(value.amount),
    original = Number(value.original_amount);
  if (
    value.currency !== currency ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 1_000_000 ||
    (value.original_amount !== null &&
      (!Number.isFinite(original) ||
        original < amount ||
        original > 1_000_000)) ||
    (value.discount_percent !== null &&
      (!Number.isInteger(value.discount_percent) ||
        value.discount_percent < 0 ||
        value.discount_percent > 100))
  )
    throw new ValidationError({ message: "Invalid regional price" });
  return value;
}
