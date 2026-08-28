import { prisma } from "infra/database";
import {
  NotFoundError,
  ServiceError,
  TooManyRequestsError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import steam, { SteamAppDetailsResult } from "infra/steam";
import game, {
  mapSteamAppToGameData,
  steamImportedGameSchema,
} from "models/game";

const ADULT_ONLY_SEXUAL_CONTENT_DESCRIPTOR_ID = 3;
const MAX_LOOKUPS_PER_WINDOW = 20;
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;

export interface SteamDetailsGateway {
  fetchAppDetails(appId: string): Promise<SteamAppDetailsResult>;
}

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
  const existingGame = await game.findOneBySteamAppId(steamAppId);
  if (existingGame) {
    return { game: existingGame, created: false };
  }

  const attempt = await reserveAttempt(userId, steamAppId, isAdmin);

  let result: SteamAppDetailsResult;
  try {
    result = await gateway.fetchAppDetails(steamAppId);
  } catch (error) {
    await finishAttempt(attempt.id, "SERVICE_ERROR");
    if (error instanceof ServiceError) throw error;
    throw new ServiceError({
      message: `Failed to reach the Steam API for app id "${steamAppId}".`,
      action: "Try again later or check Steam's service status.",
      cause: error,
    });
  }

  const descriptorIds = result.data?.content_descriptors?.ids ?? [];
  const descriptorMetadata = {
    content_descriptor_ids: descriptorIds,
    content_descriptors_present: Boolean(result.data?.content_descriptors),
  };

  if (!result?.success || !result.data) {
    await finishAttempt(attempt.id, "NOT_FOUND", descriptorMetadata);
    throw new NotFoundError({
      message: `Steam app with id "${steamAppId}" was not found or is not available.`,
      action: "Check the Steam app id or store link and try again.",
    });
  }

  if (isAdultOnlySteamGame(result)) {
    await finishAttempt(attempt.id, "BLOCKED_ADULT", descriptorMetadata);
    throw new UnsupportedContentError({
      message:
        "This Steam game cannot be imported because it is classified as Adult Only Sexual Content.",
      action: "Import a game that complies with the platform content policy.",
    });
  }

  const mappedData = mapSteamAppToGameData(result.data, steamAppId);
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

  try {
    const createdGame = await game.createUnclaimedSteamGame(parsedData.data);
    await finishAttempt(attempt.id, "SUCCESS", descriptorMetadata);
    return { game: createdGame, created: true };
  } catch (error) {
    await finishAttempt(attempt.id, "INVALID_DATA", descriptorMetadata);
    throw error;
  }
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
  outcome:
    | "SUCCESS"
    | "NOT_FOUND"
    | "SERVICE_ERROR"
    | "INVALID_DATA"
    | "BLOCKED_ADULT",
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
