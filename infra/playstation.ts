import { z } from "zod";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
} from "infra/errors";
import {
  parsePlayStationUrl,
  playStationProductUrl,
  type PlayStationCountry,
} from "lib/playstation";

const object = z.record(z.string(), z.unknown());
const asset = z.object({ type: z.string(), role: z.string(), url: z.string() });
const productSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(255),
  topCategory: z.literal("GAME"),
  storeDisplayClassification: z.string(),
  platforms: z.array(z.enum(["PS4", "PS5"])).min(1),
  publisherName: z.string().nullish(),
  releaseDate: z.string().datetime({ offset: true }).nullish(),
  descriptions: z
    .array(z.object({ type: z.string(), value: z.string() }))
    .default([]),
  media: z.array(asset).default([]),
  localizedGenres: z
    .array(z.object({ value: z.string() }))
    .default([])
    .transform((values) => values.map(({ value }) => value)),
  screenLanguages: z.array(z.string()).default([]),
  spokenLanguages: z.array(z.string()).default([]),
  edition: z
    .object({ name: z.string().nullish(), type: z.string().nullish() })
    .nullish(),
  skus: z.array(z.object({ __ref: z.string() })).default([]),
  webctas: z.array(z.unknown()).default([]),
});
export type PlayStationProduct = z.infer<typeof productSchema> & {
  country: PlayStationCountry;
  url: string;
  prices: {
    amount: string;
    original_amount: string;
    discount_percent: number | null;
    expires_at: Date | null;
  } | null;
};

export function invalidPlayStationData(
  cause?: unknown,
  reason = "FORMAT_CHANGED",
) {
  return new ServiceError({
    message: "PlayStation product data could not be read.",
    action: "Try again later. If this persists, contact support.",
    cause,
    context: reason,
  });
}

function publicPrice(
  product: z.infer<typeof productSchema>,
  cache: Record<string, Record<string, unknown>>,
  country: PlayStationCountry,
) {
  const currency = country === "BR" ? "BRL" : "USD";
  const skuIds = new Set(
    product.skus.map(({ __ref }) => __ref.replace(/^Sku:/, "")),
  );
  for (const value of Object.values(cache)) {
    const action = z
      .object({
        type: z.string(),
        param: z.array(z.object({ name: z.string(), value: z.string() })),
      })
      .safeParse(value.action);
    if (
      value.__typename !== "GameCTA" ||
      value.type !== "ADD_TO_CART" ||
      !action.success ||
      action.data.type !== "ADD_TO_CART"
    )
      continue;
    const params = action.data.param;
    const skuId = params.find(({ name }) => name === "skuId")?.value;
    if (
      !skuId ||
      !skuIds.has(skuId) ||
      !skuId.startsWith(product.id + "-") ||
      !params.some(
        ({ name, value }) => name === "rewardId" && value === "OUTRIGHT",
      )
    )
      continue;
    const parsed = z
      .object({
        basePriceValue: z.number().int().min(0).max(100_000_000),
        discountedValue: z.number().int().min(0).max(100_000_000),
        currencyCode: z.string(),
        applicability: z.literal("APPLICABLE"),
        isExclusive: z.literal(false),
        isTiedToSubscription: z.literal(false),
        serviceBranding: z.array(z.literal("NONE")),
        endTime: z.string().regex(/^\d+$/).nullish(),
      })
      .safeParse(value.price);
    if (!parsed.success || parsed.data.currencyCode !== currency) continue;
    const price = parsed.data;
    if (price.discountedValue > price.basePriceValue) continue;
    const expiry = price.endTime ? new Date(Number(price.endTime)) : null;
    if (
      expiry &&
      (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())
    )
      continue;
    return {
      amount: (price.discountedValue / 100).toFixed(2),
      original_amount: (price.basePriceValue / 100).toFixed(2),
      discount_percent:
        price.basePriceValue > 0 && price.discountedValue < price.basePriceValue
          ? Math.round(
              ((price.basePriceValue - price.discountedValue) * 100) /
                price.basePriceValue,
            )
          : null,
      expires_at: expiry,
    };
  }
  return null;
}

/** Merge only equal cache keys; never pick the first product or an upsell. */
export function parsePlayStationProduct(
  html: string,
  url: string,
): PlayStationProduct {
  const location = parsePlayStationUrl(url);
  if (!location) throw invalidPlayStationData();
  try {
    const script =
      /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        html,
      );
    const next = z
      .object({
        props: z.object({
          pageProps: z.object({
            locale: z.string(),
            productId: z.string(),
            statusCode: z.number(),
          }),
        }),
      })
      .parse(JSON.parse(script?.[1] ?? ""));
    const props = next.props.pageProps;
    if (props.statusCode === 404)
      throw new NotFoundError({
        message: "PlayStation game not found in this region.",
        action: "Check the product link.",
      });
    if (
      props.statusCode !== 200 ||
      props.productId !== location.productId ||
      props.locale !== (location.country === "BR" ? "pt-br" : "en-us")
    )
      throw invalidPlayStationData(undefined, "IDENTITY_MISMATCH");
    const cache: Record<string, Record<string, unknown>> = {};
    for (const match of html.matchAll(
      /<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        continue;
      }
      const part = z
        .object({ cache: z.record(z.string(), object) })
        .safeParse(parsed);
      if (!part.success) continue;
      for (const [key, value] of Object.entries(part.data.cache))
        cache[key] = { ...cache[key], ...value };
    }
    const raw = cache["Product:" + location.productId];
    if (!raw || raw.id !== location.productId)
      throw invalidPlayStationData(undefined, "IDENTITY_MISMATCH");
    if (
      raw.isPhysicalProduct === true ||
      raw.topCategory !== "GAME" ||
      !["FULL_GAME", "GAME_BUNDLE"].includes(
        String(raw.storeDisplayClassification),
      ) ||
      (raw.edition &&
        /DEMO|TRIAL|UPGRADE/i.test(
          String((raw.edition as { type?: unknown }).type),
        ))
    ) {
      throw new UnsupportedContentError({
        message: "Only complete PS4 and PS5 digital games can be imported.",
        action:
          "Choose the full game, not a demo, add-on, subscription or upgrade pack.",
      });
    }
    const product = productSchema.parse(raw);
    return {
      ...product,
      country: location.country,
      url: location.url,
      prices: publicPrice(product, cache, location.country),
    };
  } catch (error) {
    if (
      error instanceof UnsupportedContentError ||
      error instanceof NotFoundError ||
      error instanceof ServiceError
    )
      throw error;
    throw invalidPlayStationData(error);
  }
}

export async function fetchProduct(
  productId: string,
  country: PlayStationCountry,
): Promise<PlayStationProduct> {
  let url = playStationProductUrl(productId, country);
  if (!parsePlayStationUrl(url)) throw invalidPlayStationData();
  const signal = AbortSignal.timeout(8000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(url, {
        signal,
        redirect: "manual",
        headers: { accept: "text/html" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = response.headers.get("location");
        const next = target
          ? parsePlayStationUrl(new URL(target, url).href)
          : null;
        if (!next || next.country !== country || next.productId !== productId)
          throw invalidPlayStationData(undefined, "INVALID_REDIRECT");
        url = next.url;
        continue;
      }
      if (response.status === 404)
        throw new NotFoundError({
          message: "PlayStation game not found in this region.",
          action: "Check the product link.",
        });
      if (!response.ok)
        throw invalidPlayStationData(undefined, `HTTP_${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw invalidPlayStationData();
      const decoder = new TextDecoder();
      let html = "",
        bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 5_000_000)
            throw invalidPlayStationData(undefined, "BODY_TOO_LARGE");
          html += decoder.decode(chunk.value, { stream: true });
        }
        html += decoder.decode();
      } finally {
        await reader.cancel();
      }
      return parsePlayStationProduct(html, url);
    }
    throw invalidPlayStationData(undefined, "TOO_MANY_REDIRECTS");
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof UnsupportedContentError ||
      error instanceof ServiceError
    )
      throw error;
    throw invalidPlayStationData(
      error,
      signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
    );
  }
}
const playstation = { fetchProduct };
export default playstation;
