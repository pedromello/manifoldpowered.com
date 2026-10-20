import type { PlayStationProduct } from "infra/playstation";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import {
  isPlayStationImage,
  isPlayStationVideo,
  parsePlayStationUrl,
  type PlayStationCountry,
} from "lib/playstation";
import type { StoreImportStrategy, StoreSnapshot } from "./contracts";

export type PlayStationReference = NonNullable<
  ReturnType<typeof parsePlayStationUrl>
>;
export interface PlayStationGateway {
  fetchProduct(
    id: string,
    country: PlayStationCountry,
  ): Promise<PlayStationProduct>;
}
function text(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim()
    .slice(0, 100_000);
}
function localization(product: PlayStationProduct) {
  const long =
    product.descriptions.find(({ type }) => type === "LONG")?.value ??
    product.name;
  const short =
    product.descriptions.find(({ type }) => type === "SHORT")?.value ?? long;
  return {
    locale: product.country === "BR" ? "pt-BR" : "en",
    title: product.name,
    description: text(short).slice(0, 300),
    detailed_description: text(long),
  };
}
export function createPlayStationStrategy(
  gateway: PlayStationGateway,
): StoreImportStrategy<PlayStationReference> {
  return {
    parseReference(value) {
      const parsed = parsePlayStationUrl(value);
      if (!parsed)
        throw new ValidationError({
          message: "Invalid PlayStation Store link.",
          action:
            "Copy a Brazilian or US product/edition link from store.playstation.com.",
        });
      return parsed;
    },
    async fetchSnapshot(input, audit): Promise<StoreSnapshot> {
      const countries: PlayStationCountry[] = [
        input.country,
        input.country === "BR" ? "US" : "BR",
      ];
      const results = await Promise.allSettled(
        countries.map((country) =>
          gateway.fetchProduct(input.productId, country),
        ),
      );
      results.forEach((result, index) => {
        audit.regionalOutcomes[countries[index]] =
          result.status === "fulfilled"
            ? "SUCCESS"
            : result.reason instanceof ServiceError &&
                typeof result.reason.context === "string"
              ? result.reason.context
              : result.reason instanceof Error
                ? result.reason.name
                : "ServiceError";
      });
      // An invalid submitted edition may never be substituted by another region.
      if (
        results[0].status === "rejected" &&
        results[0].reason instanceof UnsupportedContentError
      )
        throw results[0].reason;
      const products = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (!products.length) {
        const failure = results.find(
          (result) =>
            result.status === "rejected" &&
            !(result.reason instanceof NotFoundError),
        );
        if (failure?.status === "rejected") throw failure.reason;
        throw new NotFoundError({
          message: "PlayStation game not found.",
          action: "Check the product link.",
        });
      }
      if (products.some((product) => product.id !== input.productId))
        throw new ServiceError({
          message: "PlayStation product identity mismatch.",
          action: "Check the exact edition link.",
        });
      const primary =
        products.find((product) => product.country === "BR") ?? products[0];
      const copy = localization(primary);
      const images = primary.media.filter(
        (asset) => asset.type === "IMAGE" && isPlayStationImage(asset.url),
      );
      const banner =
        images.find(
          (asset) =>
            asset.role === "GAMEHUB_COVER_ART" ||
            asset.role === "FOUR_BY_THREE_BANNER",
        )?.url ?? images.find((asset) => asset.role === "MASTER")?.url;
      const icon =
        images.find(
          (asset) =>
            asset.role === "MASTER" || asset.role === "PORTRAIT_BANNER",
        )?.url ?? banner;
      const slugBase =
        primary.name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 150) || "playstation-game";
      return {
        externalId: input.productId,
        suggestedSlug: `${slugBase}-${primary.platforms.join("-").toLowerCase()}-${input.productId.toLowerCase().replace(/_/g, "-")}`,
        fields: {
          title: copy.title,
          description: copy.description,
          detailed_description: copy.detailed_description,
          launch_date: primary.releaseDate
            ? new Date(primary.releaseDate)
            : null,
          developer_name: "Unknown developer",
          publisher_name: primary.publisherName?.slice(0, 255) ?? null,
          tags: [
            ...new Set([...primary.platforms, ...primary.localizedGenres]),
          ],
          meta_tags: {
            platforms: primary.platforms,
            languages: primary.screenLanguages,
            audio_languages: primary.spokenLanguages,
            edition: primary.edition?.name ?? null,
          },
          media: {
            ...(banner ? { banner } : {}),
            ...(icon ? { icon } : {}),
            screenshots: images
              .filter((asset) => asset.role === "SCREENSHOT")
              .map((asset) => asset.url),
            videos: primary.media
              .filter(
                (asset) =>
                  asset.type === "VIDEO" && isPlayStationVideo(asset.url),
              )
              .map((asset) => asset.url),
          },
          social_links: { playstation_page: primary.url },
          requirements: {},
        },
        localizations: products.map(localization),
        offers: products.map((product) => ({
          country: product.country,
          currency: product.country === "BR" ? "BRL" : "USD",
          url: product.url,
          amount: product.prices?.amount ?? null,
          original_amount: product.prices?.original_amount ?? null,
          discount_percent: product.prices?.discount_percent ?? null,
          expires_at: product.prices?.expires_at ?? null,
          captured_at: new Date(),
        })),
      };
    },
  };
}
