import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import type { NintendoRefresh, Prisma } from "generated/prisma/client";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
} from "infra/errors";
import { nintendoProductUrl, type NintendoCountry } from "lib/nintendo";
import type { NintendoRefreshInfo } from "lib/nintendo_refresh";

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const LEASE_MS = 30 * 1000;

async function lock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('nintendo-refresh-coordination'))) AS coordination_lock`;
}
async function clock(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  return row.now;
}

export function metadata(
  row: NintendoRefresh,
  cached = false,
): NintendoRefreshInfo {
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

function mismatched(row: NintendoRefresh | null, country: NintendoCountry) {
  const outcomes = row?.regional_outcomes;
  return (
    outcomes &&
    typeof outcomes === "object" &&
    !Array.isArray(outcomes) &&
    outcomes[country] === "IDENTITY_MISMATCH"
  );
}

async function resolve(
  tx: Prisma.TransactionClient,
  slug: string,
  country: NintendoCountry,
) {
  const scoped = await tx.nintendoRefresh.findUnique({
    where: { identity: `slug:${country}:${slug}` },
  });
  const alias =
    scoped ??
    (await tx.nintendoRefresh.findUnique({
      where: { identity: `slug:${slug}` },
    }));
  const exact = await tx.gameExternalOffer.findFirst({
    where: { provider: "NINTENDO", url: nintendoProductUrl(slug, country) },
  });
  const offer =
    exact ??
    (await tx.gameExternalOffer.findFirst({
      where: {
        provider: "NINTENDO",
        url: nintendoProductUrl(slug, country === "BR" ? "US" : "BR"),
      },
    }));
  const gameId =
    exact?.game_id ?? scoped?.game_id ?? offer?.game_id ?? alias?.game_id;
  const game = gameId
    ? await tx.game.findUnique({ where: { id: gameId } })
    : null;
  const identity = game?.nintendo_nsuid
    ? `nsuid:${game.nintendo_nsuid}`
    : (alias?.identity ?? `slug:${slug}`);
  const row = await tx.nintendoRefresh.findUnique({ where: { identity } });
  if (!exact && mismatched(row, country))
    return { identity: `slug:${country}:${slug}`, game: null };
  return { identity, game };
}

export async function reserve(slug: string, country: NintendoCountry = "BR") {
  return prisma.$transaction(
    async (tx) => {
      await lock(tx);
      const now = await clock(tx);
      const { identity, game } = await resolve(tx, slug, country);
      let row = await tx.nintendoRefresh.upsert({
        where: { identity },
        create: { identity, game_id: game?.id },
        update: {},
      });
      if (row.lease_expires_at && row.lease_expires_at > now)
        return { row, acquired: false, game };
      if (row.next_allowed_at && row.next_allowed_at > now)
        return { row, acquired: false, game };
      const active = await tx.nintendoRefresh.count({
        where: { lease_expires_at: { gt: now } },
      });
      if (active >= 4)
        throw new ServiceError({
          message: "Nintendo updates are busy. Try again shortly.",
          context: { retry_after: 2 },
          action: "Try again shortly.",
        });
      row = await tx.nintendoRefresh.update({
        where: { id: row.id },
        data: {
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

/** Held only during the short commit transaction, never during upstream I/O. */
export async function fence(
  tx: Prisma.TransactionClient,
  reservation: NintendoRefresh,
) {
  await lock(tx);
  const now = await clock(tx);
  const row = await tx.nintendoRefresh.findUniqueOrThrow({
    where: { id: reservation.id },
  });
  if (
    row.lease_token !== reservation.lease_token ||
    !row.lease_expires_at ||
    row.lease_expires_at <= now
  )
    throw new ServiceError({
      message: "This Nintendo update expired. Try again.",
      action: "Try again.",
    });
  return now;
}

export async function complete(
  tx: Prisma.TransactionClient,
  row: NintendoRefresh,
  game: { id: string; nintendo_nsuid: string | null },
  outcomes: Record<string, string>,
  slug: string,
  country: NintendoCountry,
) {
  await fence(tx, row);
  const now = await clock(tx);
  const identity = `nsuid:${game.nintendo_nsuid}`;
  const canonical = await tx.nintendoRefresh.findUnique({
    where: { identity },
  });
  const updated = await tx.nintendoRefresh.update({
    where: { id: row.id },
    data: {
      ...(!canonical || canonical.id === row.id ? { identity } : {}),
      game_id: game.id,
      state: "SUCCESS",
      lease_token: null,
      lease_expires_at: null,
      last_completed_at: now,
      next_allowed_at: new Date(now.getTime() + REFRESH_INTERVAL_MS),
      regional_outcomes: outcomes,
    },
  });
  // Preserve aliases by region as well as the shared initial lookup key.
  for (const aliasIdentity of [`slug:${slug}`, `slug:${country}:${slug}`]) {
    if (updated.identity === aliasIdentity) continue;
    await tx.nintendoRefresh.upsert({
      where: { identity: aliasIdentity },
      create: {
        identity: aliasIdentity,
        game_id: game.id,
        state: "SUCCESS",
        last_completed_at: now,
        next_allowed_at: updated.next_allowed_at,
      },
      update: aliasIdentity === `slug:${slug}` ? {} : { game_id: game.id },
    });
  }
  return updated;
}

export async function fail(
  row: NintendoRefresh,
  error: Error,
  outcomes: Record<string, string>,
) {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const now = await clock(tx);
    const negative =
      error instanceof NotFoundError ||
      error instanceof UnsupportedContentError;
    await tx.nintendoRefresh.updateMany({
      where: { id: row.id, lease_token: row.lease_token },
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

export function failure(row: NintendoRefresh) {
  const options = {
    message: row.error_message ?? "Nintendo import failed.",
    action: "Try again later.",
    context: { refresh: metadata(row) },
  };
  return row.error_name === "NotFoundError"
    ? new NotFoundError(options)
    : row.error_name === "UnsupportedContentError"
      ? new UnsupportedContentError(options)
      : new ServiceError(options);
}

export async function status(id: string, country?: NintendoCountry) {
  const row = await prisma.nintendoRefresh.findUnique({ where: { id } });
  if (!row)
    throw new NotFoundError({
      message: "Nintendo update not found.",
      action: "Check the operation.",
    });
  const refresh = metadata(row);
  if (country && row.state !== "RUNNING" && mismatched(row, country)) {
    refresh.state = "failed";
    refresh.message =
      "This region has a different Nintendo edition. Submit the link again.";
  }
  if (
    row.state === "RUNNING" &&
    (!row.lease_expires_at || row.lease_expires_at <= new Date())
  ) {
    refresh.state = "failed";
    refresh.message = "This Nintendo update expired. Try again.";
  }
  return {
    game: row.game_id
      ? await prisma.game.findUnique({ where: { id: row.game_id } })
      : null,
    created: false,
    refresh,
  };
}

export async function statusForSlug(
  slug: string,
  country: NintendoCountry = "BR",
) {
  const { identity, game } = await resolve(prisma, slug, country);
  const row = await prisma.nintendoRefresh.findUnique({ where: { identity } });
  return row
    ? status(row.id, country)
    : { game, created: false, refresh: null };
}
