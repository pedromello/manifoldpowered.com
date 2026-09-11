import { prisma } from "infra/database";
import { z } from "zod";
import type {
  SteamRefresh,
  SteamImportAttemptOutcome,
} from "generated/prisma/client";
import * as refresh from "models/steam_refresh";
import {
  NotFoundError,
  ServiceError,
  TooManyRequestsError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import steam, { SteamAppDetailsResult } from "infra/steam";
import { resolveSteamHeaderImage } from "lib/steam";
import game, {
  mapSteamAppToGameData,
  mapSteamAppToLocalization,
  SteamExternalOfferInput,
  steamImportedGameSchema,
} from "models/game";

const ADULT_ONLY_SEXUAL_CONTENT_DESCRIPTOR_ID = 3;
const MAX_LOOKUPS_PER_WINDOW = 20;
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;

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

interface ImportSteamGameOptions {
  userId: string;
  steamAppId: string;
  isAdmin?: boolean;
  gateway?: SteamDetailsGateway;
}

export function isAdultOnlySteamGame(result: SteamAppDetailsResult): boolean {
  return Boolean(
    result.data?.content_descriptors?.ids?.includes(
      ADULT_ONLY_SEXUAL_CONTENT_DESCRIPTOR_ID,
    ),
  );
}

async function importGame({
  userId,
  steamAppId,
  isAdmin = false,
  gateway = steam,
}: ImportSteamGameOptions) {
  if (
    !z
      .string()
      .regex(/^[1-9]\d{0,19}$/)
      .safeParse(steamAppId).success
  )
    throw new ValidationError({
      message: "Invalid Steam app ID.",
      action: "Enter a positive numeric Steam app ID.",
    });
  const attempt = await reserveAttempt(userId, steamAppId, isAdmin);
  const existingGame = await game.findOneBySteamAppId(steamAppId);
  if (
    existingGame &&
    (existingGame.status !== "ONLY_DISPLAY" || existingGame.studio_id !== null)
  ) {
    await finishAttempt(attempt.id, "SKIPPED_MANAGED");
    return { game: existingGame, created: false, refresh: null };
  }

  const reservation = await refresh
    .reserve(steamAppId)
    .catch(async (error: unknown) => {
      await finishAttempt(attempt.id, "CAPACITY_UNAVAILABLE");
      throw error;
    });
  if (!reservation.acquired) {
    await finishAttempt(
      attempt.id,
      reservation.row.state === "RUNNING"
        ? "SHARED_IN_PROGRESS"
        : reservation.row.state === "FAILED"
          ? "CACHED_FAILURE"
          : "CACHE_HIT",
    );
    if (reservation.row.state === "FAILED")
      throw refresh.failure(reservation.row);
    return {
      game: reservation.game,
      created: false,
      refresh: refresh.metadata(reservation.row, true),
    };
  }
  const outcomes: Record<string, string> = {};
  try {
    return await performImport(
      steamAppId,
      gateway,
      attempt.id,
      reservation.row,
      outcomes,
    );
  } catch (error) {
    const reported =
      error instanceof NotFoundError ||
      error instanceof ServiceError ||
      error instanceof UnsupportedContentError ||
      error instanceof ValidationError
        ? error
        : new ServiceError({
            message: "Steam import failed.",
            action: "Try again later.",
            cause: error,
          });
    await refresh.fail(reservation.row, reported, outcomes);
    throw reported;
  }
}

async function performImport(
  steamAppId: string,
  gateway: SteamDetailsGateway,
  attemptId: string,
  reservation: SteamRefresh,
  outcomes: Record<string, string>,
) {
  const attempt = { id: attemptId };

  let regionalResults: Awaited<ReturnType<typeof fetchRegionalDetails>>;
  try {
    regionalResults = await fetchRegionalDetails(gateway, steamAppId, outcomes);
  } catch (error) {
    await finishAttempt(attempt.id, "SERVICE_ERROR");
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
  const descriptorMetadata = {
    content_descriptor_ids: descriptorIds,
    content_descriptors_present: successfulResults.some((entry) =>
      Boolean(entry.result.data?.content_descriptors),
    ),
  };

  if (!primaryResult?.result.data && successfulResults.length > 0) {
    await finishAttempt(attempt.id, "SERVICE_ERROR", descriptorMetadata);
    throw new ServiceError({
      message: `Steam did not return the English catalog data for app id "${steamAppId}".`,
      action: "Try again later.",
    });
  }

  if (!primaryResult?.result.data) {
    await finishAttempt(attempt.id, "NOT_FOUND", descriptorMetadata);
    throw new NotFoundError({
      message: `Steam app with id "${steamAppId}" was not found or is not available.`,
      action: "Check the Steam app id or store link and try again.",
    });
  }

  if (successfulResults.some((entry) => isAdultOnlySteamGame(entry.result))) {
    await finishAttempt(attempt.id, "BLOCKED_ADULT", descriptorMetadata);
    throw new UnsupportedContentError({
      message:
        "This Steam game cannot be imported because it is classified as Adult Only Sexual Content.",
      action: "Import a game that complies with the platform content policy.",
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
    await finishAttempt(attempt.id, "INVALID_DATA", descriptorMetadata);
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

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await refresh.fence(tx, reservation);
        const existingGame = await tx.game.findUnique({
          where: { steam_app_id: steamAppId },
        });
        // A claim or moderation decision may have arrived during the HTTP calls.
        const managed =
          existingGame &&
          (existingGame.status !== "ONLY_DISPLAY" ||
            existingGame.studio_id !== null);
        const importedGame = managed
          ? existingGame
          : existingGame
            ? await game.refreshUnclaimedSteamGame(
                existingGame.id,
                parsedData.data,
                externalOffers,
                localization,
                tx,
              )
            : await game.createUnclaimedSteamGame(
                parsedData.data,
                externalOffers,
                localization,
                tx,
              );
        const completed = await refresh.complete(
          tx,
          reservation,
          importedGame.id,
          outcomes,
        );
        return {
          game: importedGame,
          created: !existingGame,
          refresh: refresh.metadata(completed),
        };
      },
      { maxWait: 15000, timeout: 15000 },
    );
    await finishAttempt(attempt.id, "SUCCESS", descriptorMetadata);
    return result;
  } catch (error) {
    await finishAttempt(attempt.id, "INVALID_DATA", descriptorMetadata);
    throw error;
  }
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

async function reserveAttempt(
  userId: string,
  steamAppId: string,
  isAdmin: boolean,
) {
  return await prisma.$transaction(async (tx) => {
    if (!isAdmin) {
      // Serialize reservations per user so concurrent requests cannot all pass
      // the count before any of them creates its attempt row.
      await tx.$queryRaw`
        SELECT 1 AS locked
        FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS user_lock
      `;

      const windowStart = new Date(Date.now() - LOOKUP_WINDOW_MS);
      const attemptsInWindow = await tx.steamImportAttempt.count({
        where: { user_id: userId, created_at: { gte: windowStart } },
      });

      if (attemptsInWindow >= MAX_LOOKUPS_PER_WINDOW) {
        throw new TooManyRequestsError({
          message: "Steam import limit exceeded.",
          action: "Wait before importing another Steam game.",
        });
      }
    }

    return await tx.steamImportAttempt.create({
      data: { user_id: userId, steam_app_id: steamAppId },
    });
  });
}

async function finishAttempt(
  id: string,
  outcome: SteamImportAttemptOutcome,
  metadata?: {
    content_descriptor_ids: number[];
    content_descriptors_present: boolean;
  },
) {
  await prisma.steamImportAttempt.update({
    where: { id },
    data: { outcome, ...metadata },
  });
}

const steamImport = {
  importGame,
  isAdultOnlySteamGame,
};

export default steamImport;
