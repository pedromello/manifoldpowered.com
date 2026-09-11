import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import type { NintendoProduct } from "infra/nintendo";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import { parseNintendoUrl, type NintendoCountry } from "lib/nintendo";
import { mergeGameFeatures, nintendoFeatures } from "lib/game_features";
import type { StoreImportStrategy, StoreSnapshot } from "./contracts";

export type NintendoReference = NonNullable<
  ReturnType<typeof parseNintendoUrl>
>;
export interface NintendoGateway {
  fetchProduct(
    slug: string,
    country: NintendoCountry,
  ): Promise<NintendoProduct>;
}

function label(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const parsed = z
    .object({ label: z.string().optional(), name: z.string().optional() })
    .safeParse(value);
  return parsed.success ? (parsed.data.label ?? parsed.data.name) : undefined;
}

function imageUrl(asset: { publicId: string } | null | undefined) {
  const id = asset?.publicId.replace(/^\//, "");
  if (!id || !/^store\/software\/(switch|switch2)\/[a-zA-Z0-9/_-]+$/.test(id))
    return undefined;
  return `https://assets.nintendo.com/image/upload/q_auto/f_auto/${id}`;
}

function localization(product: NintendoProduct) {
  return {
    locale: product.country === "BR" ? "pt-BR" : "en",
    title: product.name,
    description: (
      product.headline ||
      product.description ||
      product.name
    ).slice(0, 300),
    // Plain text only; imported HTML never reaches the Markdown renderer.
    detailed_description: (product.description || product.name)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
  };
}

export function createNintendoStrategy(
  gateway: NintendoGateway,
): StoreImportStrategy<NintendoReference> {
  return {
    parseReference(eshopUrl) {
      const input = parseNintendoUrl(eshopUrl);
      if (!input)
        throw new ValidationError({
          message: "Invalid Nintendo eShop link.",
          action:
            "Copy a Brazilian or US product page link from www.nintendo.com.",
        });
      return input;
    },
    async fetchSnapshot(input, audit): Promise<StoreSnapshot> {
      const countries: NintendoCountry[] = [
        input.country,
        input.country === "BR" ? "US" : "BR",
      ];
      const results = await Promise.allSettled(
        countries.map((country) => gateway.fetchProduct(input.slug, country)),
      );
      const outcomes = audit.regionalOutcomes;
      results.forEach((result, index) => {
        outcomes[countries[index]] =
          result.status === "fulfilled"
            ? "SUCCESS"
            : result.reason instanceof ServiceError &&
                typeof result.reason.context === "string"
              ? result.reason.context
              : result.reason instanceof Error
                ? result.reason.name
                : "ServiceError";
      });
      // Never turn a submitted DLC/upgrade into a different product in another region.
      if (
        results[0].status === "rejected" &&
        results[0].reason instanceof UnsupportedContentError
      )
        throw results[0].reason;
      const products = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (!products.length) {
        const first = results.find(
          (result) =>
            result.status === "rejected" &&
            !(result.reason instanceof NotFoundError),
        );
        if (first?.status === "rejected") throw first.reason;
        throw new NotFoundError({
          message: "Nintendo game not found.",
          action: "Check the product link and try again.",
        });
      }
      const selected = products[0];
      const matching = products.filter((product) => {
        if (product.nsuid === selected.nsuid) return true;
        outcomes[product.country] = "IDENTITY_MISMATCH";
        return false;
      });
      const primary =
        matching.find((product) => product.country === "BR") ?? selected;
      const copy = localization(primary);
      const banner = imageUrl(primary.productImage);
      const screenshots = (primary.productGallery ?? [])
        .filter((asset) => asset.resourceType === "image")
        .flatMap((asset) => (imageUrl(asset) ? [imageUrl(asset)!] : []));
      const data = {
        title: copy.title,
        description: copy.description,
        detailed_description: copy.detailed_description,
        launch_date: primary.releaseDate ? new Date(primary.releaseDate) : null,
        developer_name: (
          label(primary.softwareDeveloper) ||
          label(primary.softwarePublisher) ||
          "Unknown developer"
        ).slice(0, 255),
        publisher_name: label(primary.softwarePublisher)?.slice(0, 255) ?? null,
        tags: [
          ...new Set([
            primary.platform.label,
            ...(primary.tags?.genres ?? []).map((genre) => genre.label),
          ]),
        ],
        meta_tags: {
          features: matching
            .filter((product) => product !== primary)
            .concat(primary)
            .reduce(
              (features, product) =>
                mergeGameFeatures(
                  { features },
                  nintendoFeatures(product.numberOfPlayers),
                ),
              {},
            ),
          platforms: [primary.platform.label],
          languages: primary.supportedLanguages ?? [],
          ...(label(primary.contentRating)
            ? { rating: label(primary.contentRating) }
            : {}),
        },
        media: {
          ...(banner ? { banner, icon: banner } : {}),
          screenshots,
          videos: [],
        },
      };
      const slugBase =
        primary.name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 200) || "nintendo-game";

      return {
        externalId: selected.nsuid,
        suggestedSlug: `${slugBase}-${primary.platform.code === "NINTENDO_SWITCH_2" ? "switch-2" : "switch"}-${selected.nsuid}`,
        fields: data,
        localizations: matching.map(localization),
        offers: matching.map((product) => {
          const amount = product.prices
            ? new Prisma.Decimal(product.prices.finalPrice.toString())
            : null;
          const original = product.prices
            ? new Prisma.Decimal(product.prices.regularPrice.toString())
            : null;
          return {
            country: product.country,
            currency: product.country === "BR" ? "BRL" : "USD",
            url: product.url,
            amount: amount?.toString() ?? null,
            original_amount: original?.toString() ?? null,
            captured_at: new Date(),
            discount_percent:
              amount && original?.gt(0) && amount.lt(original)
                ? original
                    .minus(amount)
                    .div(original)
                    .mul(100)
                    .round()
                    .toNumber()
                : null,
          };
        }),
      };
    },
  };
}
