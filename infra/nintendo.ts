import { z } from "zod";
import { playerCountSchema } from "lib/game_features";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
} from "infra/errors";
import {
  nintendoProductUrl,
  parseNintendoUrl,
  type NintendoCountry,
} from "lib/nintendo";

const labelSchema = z.object({ label: z.string() });
const assetSchema = z.object({
  publicId: z.string(),
  resourceType: z.string().optional(),
});
const productSchema = z.object({
  nsuid: z.string().regex(/^700100\d{8}$/),
  name: z.string().trim().min(1).max(255),
  urlKey: z.string(),
  locale: z.enum(["pt_BR", "en_US"]),
  platform: z.object({
    code: z.enum(["NINTENDO_SWITCH", "NINTENDO_SWITCH_2"]),
    label: z.string(),
  }),
  topLevelCategory: z.object({ code: z.literal("GAMES") }),
  isUpgrade: z.literal(false),
  dlcType: z.null().optional(),
  description: z.string().nullish(),
  headline: z.string().nullish(),
  releaseDate: z.string().datetime({ offset: true }).nullish(),
  softwareDeveloper: z.unknown().optional(),
  softwarePublisher: z.unknown().optional(),
  supportedLanguages: z.array(z.string()).nullish(),
  numberOfPlayers: z
    .object({
      system: playerCountSchema.nullish().catch(undefined),
      local: playerCountSchema.nullish().catch(undefined),
      online: playerCountSchema.nullish().catch(undefined),
    })
    .nullish()
    .catch(undefined),
  contentRating: z.unknown().optional(),
  tags: z.object({ genres: z.array(labelSchema).optional() }).nullish(),
  productImage: assetSchema.nullish(),
  productGallery: z.array(assetSchema).nullish(),
  'prices({"personalized":false})': z.unknown().optional(),
});

const pricesSchema = z.object({
  currency: z.enum(["BRL", "USD"]),
  regularPrice: z.number().finite().min(0).max(1000000),
  finalPrice: z.number().finite().min(0).max(1000000),
});

export type NintendoProduct = z.infer<typeof productSchema> & {
  country: NintendoCountry;
  url: string;
  prices: z.infer<typeof pricesSchema> | null;
};

export function invalidNintendoData(
  cause?: unknown,
  reason = "FORMAT_CHANGED",
) {
  return new ServiceError({
    message: "Nintendo product data could not be read.",
    action: "Try again later. If this persists, contact support.",
    cause,
    context: reason,
  });
}

/** Resolve ROOT_QUERY, never the first product (which may be an upsell). */
export function parseNintendoProduct(
  html: string,
  url: string,
): NintendoProduct {
  const location = parseNintendoUrl(url);
  if (!location) throw invalidNintendoData();
  try {
    const script =
      /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        html,
      );
    const data: unknown = JSON.parse(script?.[1] ?? "");
    const root = z
      .object({
        props: z.object({
          pageProps: z.object({
            initialApolloState: z.record(z.string(), z.unknown()),
          }),
        }),
      })
      .parse(data);
    const cache = root.props.pageProps.initialApolloState;
    const query = z.record(z.string(), z.unknown()).parse(cache.ROOT_QUERY);
    const key = Object.keys(query).find((candidate) => {
      if (!candidate.startsWith("product(")) return false;
      try {
        const args = z
          .object({ input: z.object({ urlKey: z.string() }) })
          .parse(JSON.parse(candidate.slice(8, -1)));
        return args.input.urlKey === location.slug;
      } catch {
        return false;
      }
    });
    const reference = z
      .object({ __ref: z.string() })
      .parse(key ? query[key] : null);
    const raw = z.record(z.string(), z.unknown()).parse(cache[reference.__ref]);
    if (
      raw.isUpgrade === true ||
      raw.demoNsuid === raw.nsuid ||
      (typeof raw.edition === "string" &&
        /\bdemo\b|\btrial\b/i.test(raw.edition)) ||
      (typeof raw.nsuid === "string" && !raw.nsuid.startsWith("700100")) ||
      raw.dlcType != null ||
      (raw.topLevelCategory &&
        z.object({ code: z.string() }).parse(raw.topLevelCategory).code !==
          "GAMES")
    ) {
      throw new UnsupportedContentError({
        message:
          "Only complete Nintendo Switch and Switch 2 digital games can be imported.",
        action: "Choose the full game, not a demo, add-on or upgrade pack.",
      });
    }
    const product = productSchema.parse(raw);
    const ratingRef = z
      .object({ __ref: z.string() })
      .safeParse(product.contentRating);
    if (ratingRef.success) product.contentRating = cache[ratingRef.data.__ref];
    if (
      product.urlKey !== location.slug ||
      product.locale !== (location.country === "BR" ? "pt_BR" : "en_US")
    )
      throw invalidNintendoData();
    const parsedPrice = pricesSchema.safeParse(
      product['prices({"personalized":false})'],
    );
    const prices =
      parsedPrice.success &&
      parsedPrice.data.currency === (location.country === "BR" ? "BRL" : "USD")
        ? parsedPrice.data
        : null;
    return { ...product, country: location.country, url: location.url, prices };
  } catch (error) {
    if (error instanceof UnsupportedContentError) throw error;
    throw invalidNintendoData(error);
  }
}

export async function fetchProduct(
  slug: string,
  country: NintendoCountry,
): Promise<NintendoProduct> {
  let url = nintendoProductUrl(slug, country);
  const signal = AbortSignal.timeout(8000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(url, { signal, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = response.headers.get("location");
        const next = target
          ? parseNintendoUrl(new URL(target, url).href)
          : null;
        if (!next || next.country !== country)
          throw invalidNintendoData(undefined, "INVALID_REDIRECT");
        url = next.url;
        continue;
      }
      if (response.status === 404)
        throw new NotFoundError({
          message: "Nintendo game not found in this region.",
          action: "Check the product link.",
        });
      if (!response.ok)
        throw invalidNintendoData(undefined, `HTTP_${response.status}`);
      // Bound the public HTML body as well as the request duration.
      const reader = response.body?.getReader();
      if (!reader) throw invalidNintendoData();
      const decoder = new TextDecoder();
      let html = "",
        bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 5_000_000)
            throw invalidNintendoData(undefined, "BODY_TOO_LARGE");
          html += decoder.decode(chunk.value, { stream: true });
        }
        html += decoder.decode();
      } finally {
        await reader.cancel();
      }
      return parseNintendoProduct(html, url);
    }
    throw invalidNintendoData(undefined, "TOO_MANY_REDIRECTS");
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof UnsupportedContentError ||
      error instanceof ServiceError
    )
      throw error;
    throw invalidNintendoData(
      error,
      signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
    );
  }
}

const nintendo = { fetchProduct };
export default nintendo;
