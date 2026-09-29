import { z } from "zod";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import type { SteamAppDetailsResult } from "infra/steam";
import { resolveSteamHeaderImage } from "lib/steam";
import {
  mapSteamAppToGameData,
  mapSteamAppToLocalization,
  steamImportedGameSchema,
  type SteamExternalOfferInput,
} from "models/game";
import type {
  StoreImportStrategy,
  StoreSnapshot,
  ImportAudit,
} from "./contracts";

const ADULT_ONLY_SEXUAL_CONTENT_DESCRIPTOR_ID = 3;
export interface SteamDetailsGateway {
  fetchAppDetails(
    appId: string,
    countryCode?: string,
    language?: string,
  ): Promise<SteamAppDetailsResult>;
}

const STEAM_REGIONS = [
  { country: "US", countryCode: "us", language: "english" },
  { country: "BR", countryCode: "br", language: "brazilian" },
] as const;

export function isAdultOnlySteamGame(result: SteamAppDetailsResult): boolean {
  return Boolean(
    result.data?.content_descriptors?.ids?.includes(
      ADULT_ONLY_SEXUAL_CONTENT_DESCRIPTOR_ID,
    ),
  );
}

export function createSteamStrategy(
  gateway: SteamDetailsGateway,
): StoreImportStrategy<string> {
  return {
    parseReference(input) {
      if (
        !z
          .string()
          .regex(/^[1-9]\d{0,19}$/)
          .safeParse(input).success
      )
        throw new ValidationError({
          message: "Invalid Steam app ID.",
          action: "Enter a positive numeric Steam app ID.",
        });
      return input;
    },
    async fetchSnapshot(steamAppId, audit): Promise<StoreSnapshot> {
      const outcomes = audit.regionalOutcomes;
      let regionalResults: Awaited<ReturnType<typeof fetchRegionalDetails>>;
      try {
        regionalResults = await fetchRegionalDetails(
          gateway,
          steamAppId,
          outcomes,
        );
      } catch (error) {
        markFailure(audit, "SERVICE_ERROR");
        if (error instanceof ServiceError) throw error;
        throw new ServiceError({
          message: `Failed to reach the Steam API for app id "${steamAppId}".`,
          action: "Try again later or check Steam's service status.",
          cause: error,
        });
      }

      const successfulResults = regionalResults.filter(
        (entry) => entry.result.success && entry.result.data,
      );
      const primaryResult = successfulResults.find(
        (entry) => entry.country === "US",
      );
      const brazilianResult = successfulResults.find(
        (entry) => entry.country === "BR",
      );

      const descriptorIds = Array.from(
        new Set(
          successfulResults.flatMap(
            (entry) => entry.result.data?.content_descriptors?.ids ?? [],
          ),
        ),
      );
      audit.descriptorIds = descriptorIds;
      audit.descriptorsPresent = successfulResults.some((entry) =>
        Boolean(entry.result.data?.content_descriptors),
      );

      if (!primaryResult?.result.data && successfulResults.length > 0) {
        markFailure(audit, "SERVICE_ERROR");
        throw new ServiceError({
          message: `Steam did not return the English catalog data for app id "${steamAppId}".`,
          action: "Try again later.",
        });
      }

      if (!primaryResult?.result.data) {
        markFailure(audit, "NOT_FOUND");
        throw new NotFoundError({
          message: `Steam app with id "${steamAppId}" was not found or is not available.`,
          action: "Check the Steam app id or store link and try again.",
        });
      }

      if (
        successfulResults.some((entry) => isAdultOnlySteamGame(entry.result))
      ) {
        markFailure(audit, "BLOCKED_ADULT");
        throw new UnsupportedContentError({
          message:
            "This Steam game cannot be imported because it is classified as Adult Only Sexual Content.",
          action:
            "Import a game that complies with the platform content policy.",
        });
      }

      const mappedData = mapSteamAppToGameData(
        primaryResult.result.data,
        steamAppId,
      );
      mappedData.media.banner = await resolveSteamHeaderImage(
        primaryResult.result.data.header_image,
      );
      const parsedData = steamImportedGameSchema.safeParse(mappedData);

      if (!parsedData.success) {
        markFailure(audit, "INVALID_DATA");
        throw new ValidationError({
          message: "Steam data could not be mapped into a valid game",
          action:
            "Contact support — the imported Steam data did not pass validation",
          context: parsedData.error.issues,
        });
      }

      const externalOffers = successfulResults.map((entry) =>
        mapSteamOffer(entry.result.data!, steamAppId, entry.country),
      );
      const localization = brazilianResult?.result.data
        ? mapSteamAppToLocalization(brazilianResult.result.data)
        : undefined;

      audit.failureOutcome = "INVALID_DATA";
      const data = parsedData.data;
      // Validate media before the persistence transaction, as for every other source field.
      for (const url of data.media.videos) {
        const host = new URL(url).hostname;
        if (
          !["www.youtube.com", "youtube.com", "youtu.be"].includes(host) &&
          !host.endsWith(".steamstatic.com")
        )
          throw new ValidationError({
            message: `Invalid video URL: ${url}. Videos must be a valid URL hosted on YouTube or Steam.`,
            action: "Check if video URL is valid and from YouTube or Steam.",
          });
      }
      return {
        externalId: steamAppId,
        suggestedSlug: data.title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/--+/g, "-")
          .trim(),
        fields: {
          title: data.title,
          description: data.description,
          detailed_description: data.detailed_description,
          launch_date: new Date(data.launch_date),
          developer_name: data.developer_name,
          publisher_name: data.publisher_name,
          tags: data.tags,
          meta_tags: data.meta_tags,
          media: data.media,
          social_links: data.social_links,
          requirements: data.requirements ?? {},
        },
        localizations: localization ? [localization] : [],
        offers: externalOffers.map((offer) => ({
          country: offer.country,
          currency: offer.currency,
          url: offer.url,
          discount_percent: offer.discount_percent,
          captured_at: offer.captured_at,
          amount: offer.amount?.toString() ?? null,
          original_amount: offer.original_amount?.toString() ?? null,
        })),
        primaryPrice: {
          amount: data.steam_price?.toString() ?? null,
          original_amount: data.steam_original_price?.toString() ?? null,
          discount_percent: data.steam_discount_percent,
          currency: data.steam_price_currency,
          captured_at: data.steam_price_captured_at,
        },
      };
    },
  };
}
function markFailure(
  audit: ImportAudit,
  outcome: ImportAudit["failureOutcome"],
) {
  audit.failureOutcome = outcome;
}
async function fetchRegionalDetails(
  gateway: SteamDetailsGateway,
  steamAppId: string,
  outcomes: Record<string, string>,
) {
  const settled = await Promise.allSettled(
    STEAM_REGIONS.map(async ({ country, countryCode, language }) => {
      try {
        const result = await gateway.fetchAppDetails(
          steamAppId,
          countryCode,
          language,
        );
        outcomes[country] =
          result?.success && result.data ? "SUCCESS" : "NOT_FOUND";
        return { country, result };
      } catch (error) {
        outcomes[country] = "SERVICE_ERROR";
        throw error;
      }
    }),
  );

  const fulfilled = settled
    .filter(
      (
        entry,
      ): entry is PromiseFulfilledResult<{
        country: (typeof STEAM_REGIONS)[number]["country"];
        result: SteamAppDetailsResult;
      }> => entry.status === "fulfilled",
    )
    .map((entry) => entry.value);

  const rejected = settled.find(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected",
  );
  const hasUsableResult = fulfilled.some(
    (entry) => entry.result.success && entry.result.data,
  );

  if (fulfilled.length > 0 && (hasUsableResult || !rejected)) return fulfilled;

  throw rejected?.reason;
}

function mapSteamOffer(
  data: NonNullable<SteamAppDetailsResult["data"]>,
  steamAppId: string,
  country: SteamExternalOfferInput["country"],
): SteamExternalOfferInput {
  const amountCents = data.is_free ? 0 : data.price_overview?.final;
  const originalAmountCents = data.is_free ? 0 : data.price_overview?.initial;

  return {
    provider: "STEAM",
    country,
    currency:
      data.price_overview?.currency ?? (country === "BR" ? "BRL" : "USD"),
    amount: amountCents === undefined ? null : amountCents / 100,
    original_amount:
      originalAmountCents === undefined ? null : originalAmountCents / 100,
    discount_percent: data.price_overview?.discount_percent ?? 0,
    captured_at: new Date(),
    url: `https://store.steampowered.com/app/${steamAppId}/`,
  };
}
