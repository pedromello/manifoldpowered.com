import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import type { SteamRefresh, Prisma } from "generated/prisma/client";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
} from "infra/errors";
import type { ExternalRefreshInfo } from "lib/external_refresh";

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const LEASE_MS = 30000;

async function lock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('steam-refresh-coordination'))) AS coordination_lock`;
}
async function clock(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  return row.now;
}
export function metadata(
  row: SteamRefresh,
  cached = false,
): ExternalRefreshInfo {
  return {
    operation_id: row.id,
    state:
      row.state === "RUNNING"
        ? "in_progress"
        : row.state === "FAILED"
          ? "failed"
          : cached
            ? "cached"
            : "updated",
    last_completed_at: row.last_completed_at?.toISOString() ?? null,
    next_allowed_at: row.next_allowed_at?.toISOString() ?? null,
    ...(row.error_message ? { message: row.error_message } : {}),
  };
}
export async function reserve(steamAppId: string) {
  return prisma.$transaction(
    async (tx) => {
      await lock(tx);
      const now = await clock(tx);
      const game = await tx.game.findUnique({
        where: { steam_app_id: steamAppId },
      });
      let row = await tx.steamRefresh.upsert({
        where: { steam_app_id: steamAppId },
        create: { steam_app_id: steamAppId, game_id: game?.id },
        update: {},
      });
      if (
        (row.lease_expires_at && row.lease_expires_at > now) ||
        (row.next_allowed_at && row.next_allowed_at > now)
      )
        return { row, acquired: false, game };
      const active = await tx.steamRefresh.count({
        where: { lease_expires_at: { gt: now } },
      });
      if (active >= 4)
        throw new ServiceError({
          message: "Steam updates are busy. Try again shortly.",
          action: "Try again shortly.",
          context: { retry_after: 2 },
        });
      row = await tx.steamRefresh.update({
        where: { id: row.id },
        data: {
          game_id: game?.id,
          state: "RUNNING",
          lease_token: randomUUID(),
          lease_expires_at: new Date(now.getTime() + LEASE_MS),
          error_name: null,
          error_message: null,
        },
      });
      return { row, acquired: true, game };
    },
    { maxWait: 15000, timeout: 15000 },
  );
}
// Fence and commit share a short transaction; upstream requests hold no connection.
export async function fence(
  tx: Prisma.TransactionClient,
  reservation: SteamRefresh,
) {
  await lock(tx);
  const now = await clock(tx);
  const row = await tx.steamRefresh.findUniqueOrThrow({
    where: { id: reservation.id },
  });
  if (
    row.lease_token !== reservation.lease_token ||
    !row.lease_expires_at ||
    row.lease_expires_at <= now
  )
    throw new ServiceError({
      message: "This Steam update expired. Try again.",
      action: "Try again.",
    });
  return now;
}
export async function complete(
  tx: Prisma.TransactionClient,
  row: SteamRefresh,
  gameId: string,
  outcomes: Record<string, string>,
) {
  const now = await fence(tx, row);
  return tx.steamRefresh.update({
    where: { id: row.id },
    data: {
      game_id: gameId,
      state: "SUCCESS",
      lease_token: null,
      lease_expires_at: null,
      last_completed_at: now,
      next_allowed_at: new Date(now.getTime() + REFRESH_INTERVAL_MS),
      regional_outcomes: outcomes,
    },
  });
}
export async function fail(
  row: SteamRefresh,
  error: Error,
  outcomes: Record<string, string>,
) {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const now = await clock(tx);
    const negative =
      error instanceof NotFoundError ||
      error instanceof UnsupportedContentError;
    await tx.steamRefresh.updateMany({
      where: {
        id: row.id,
        lease_token: row.lease_token,
        lease_expires_at: { gt: now },
      },
      data: {
        state: "FAILED",
        lease_token: null,
        lease_expires_at: null,
        last_completed_at: now,
        next_allowed_at: new Date(
          now.getTime() + (negative ? REFRESH_INTERVAL_MS : 60000),
        ),
        error_name: error.name,
        error_message: error.message,
        regional_outcomes: outcomes,
      },
    });
  });
}
export function failure(row: SteamRefresh) {
  const options = {
    message: row.error_message ?? "Steam import failed.",
    action: "Try again later.",
  };
  return row.error_name === "NotFoundError"
    ? new NotFoundError(options)
    : row.error_name === "UnsupportedContentError"
      ? new UnsupportedContentError(options)
      : new ServiceError(options);
}
export async function status(id: string) {
  const row = await prisma.steamRefresh.findUnique({ where: { id } });
  if (!row)
    throw new NotFoundError({
      message: "Steam update not found.",
      action: "Check the operation.",
    });
  const refresh = metadata(row);
  if (
    row.state === "RUNNING" &&
    (!row.lease_expires_at || row.lease_expires_at <= new Date())
  ) {
    refresh.state = "failed";
    refresh.message = "This Steam update expired. Try again.";
  }
  return {
    game: await prisma.game.findUnique({
      where: { steam_app_id: row.steam_app_id },
    }),
    created: false,
    refresh,
  };
}
export async function statusForApp(steamAppId: string) {
  const row = await prisma.steamRefresh.findUnique({
    where: { steam_app_id: steamAppId },
  });
  return row
    ? status(row.id)
    : {
        game: await prisma.game.findUnique({
          where: { steam_app_id: steamAppId },
        }),
        created: false,
        refresh: null,
      };
}
