import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import type { Game, Prisma } from "generated/prisma/client";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
} from "infra/errors";
import type { ExternalRefreshInfo } from "lib/external_refresh";

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const LEASE_MS = 30 * 1000;
const MAX_ACTIVE_REFRESHES = 4;

export interface ExternalRefreshRow {
  id: string;
  game_id: string | null;
  state: string;
  lease_token: string | null;
  lease_expires_at: Date | null;
  last_completed_at: Date | null;
  next_allowed_at: Date | null;
  error_name: string | null;
  error_message: string | null;
}

export type ExternalRefreshWrite = Partial<Omit<ExternalRefreshRow, "id">> & {
  regional_outcomes?: Record<string, string>;
};

export interface RefreshResolution {
  identity: string;
  game: Game | null;
}

export interface ExternalRefreshOwnership {
  id: string;
  lease_token: string;
  lease_expires_at: { gt: Date };
}

/** Storage and identity rules only; timing and ownership belong to the coordinator. */
export interface ExternalRefreshRepository<
  Reference,
  Row extends ExternalRefreshRow,
  Completion,
> {
  resolve(
    tx: Prisma.TransactionClient,
    reference: Reference,
  ): Promise<RefreshResolution>;
  findByIdentity(
    tx: Prisma.TransactionClient,
    identity: string,
  ): Promise<Row | null>;
  findById(tx: Prisma.TransactionClient, id: string): Promise<Row | null>;
  ensure(
    tx: Prisma.TransactionClient,
    resolved: RefreshResolution,
  ): Promise<Row>;
  countActive(tx: Prisma.TransactionClient, now: Date): Promise<number>;
  acquire(
    tx: Prisma.TransactionClient,
    row: Row,
    game: Game | null,
    data: ExternalRefreshWrite,
  ): Promise<Row>;
  complete(
    tx: Prisma.TransactionClient,
    row: Row,
    completion: Completion,
    data: ExternalRefreshWrite,
  ): Promise<Row>;
  failOwned(
    tx: Prisma.TransactionClient,
    ownership: ExternalRefreshOwnership,
    data: ExternalRefreshWrite,
  ): Promise<void>;
  gameForRow(tx: Prisma.TransactionClient, row: Row): Promise<Game | null>;
}

export function metadata(
  row: ExternalRefreshRow,
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

export function createExternalRefreshCoordinator<
  Reference,
  Row extends ExternalRefreshRow,
  Completion,
  StatusContext = undefined,
>({
  label,
  lockName,
  repository,
  failureContext,
  decorateStatus,
}: {
  label: string;
  /** Keep a deployed provider's lock name stable during rolling upgrades. */
  lockName: string;
  repository: ExternalRefreshRepository<Reference, Row, Completion>;
  failureContext?: (row: Row) => unknown;
  decorateStatus?: (
    row: Row,
    refresh: ExternalRefreshInfo,
    context?: StatusContext,
  ) => void;
}) {
  async function lock(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${lockName}))) AS coordination_lock`;
  }
  async function clock(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return row.now;
  }
  async function reserve(reference: Reference) {
    return prisma.$transaction(
      async (tx) => {
        await lock(tx);
        const now = await clock(tx);
        const resolved = await repository.resolve(tx, reference);
        let row = await repository.ensure(tx, resolved);
        if (
          (row.lease_expires_at && row.lease_expires_at > now) ||
          (row.next_allowed_at && row.next_allowed_at > now)
        )
          return { row, acquired: false, game: resolved.game };
        if ((await repository.countActive(tx, now)) >= MAX_ACTIVE_REFRESHES)
          throw new ServiceError({
            message: `${label} updates are busy. Try again shortly.`,
            action: "Try again shortly.",
            context: { retry_after: 2 },
          });
        row = await repository.acquire(tx, row, resolved.game, {
          state: "RUNNING",
          lease_token: randomUUID(),
          lease_expires_at: new Date(now.getTime() + LEASE_MS),
          error_name: null,
          error_message: null,
        });
        return { row, acquired: true, game: resolved.game };
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }

  /** The caller holds this short transaction through commit, never through HTTP I/O. */
  async function fence(tx: Prisma.TransactionClient, reservation: Row) {
    await lock(tx);
    const now = await clock(tx);
    const row = await repository.findById(tx, reservation.id);
    if (
      !row ||
      !reservation.lease_token ||
      row.lease_token !== reservation.lease_token ||
      !row.lease_expires_at ||
      row.lease_expires_at <= now
    )
      throw new ServiceError({
        message: `This ${label} update expired. Try again.`,
        action: "Try again.",
      });
    return now;
  }

  async function complete(
    tx: Prisma.TransactionClient,
    row: Row,
    completion: Completion,
    outcomes: Record<string, string>,
  ) {
    const now = await fence(tx, row);
    return repository.complete(tx, row, completion, {
      state: "SUCCESS",
      lease_token: null,
      lease_expires_at: null,
      last_completed_at: now,
      next_allowed_at: new Date(now.getTime() + REFRESH_INTERVAL_MS),
      regional_outcomes: outcomes,
    });
  }

  async function fail(
    row: Row,
    error: Error,
    outcomes: Record<string, string>,
  ) {
    if (!row.lease_token) return;
    const leaseToken = row.lease_token;
    return prisma.$transaction(async (tx) => {
      await lock(tx);
      const now = await clock(tx);
      const negative =
        error instanceof NotFoundError ||
        error instanceof UnsupportedContentError;
      // The conditional write must check both token and expiry, even without a successor.
      await repository.failOwned(
        tx,
        {
          id: row.id,
          lease_token: leaseToken,
          lease_expires_at: { gt: now },
        },
        {
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
      );
    });
  }

  function failure(row: Row) {
    const options = {
      message: row.error_message ?? `${label} import failed.`,
      action: "Try again later.",
      ...(failureContext ? { context: failureContext(row) } : {}),
    };
    return row.error_name === "NotFoundError"
      ? new NotFoundError(options)
      : row.error_name === "UnsupportedContentError"
        ? new UnsupportedContentError(options)
        : new ServiceError(options);
  }

  async function status(id: string, context?: StatusContext) {
    const row = await repository.findById(prisma, id);
    if (!row)
      throw new NotFoundError({
        message: `${label} update not found.`,
        action: "Check the operation.",
      });
    const refresh = metadata(row);
    decorateStatus?.(row, refresh, context);
    if (
      row.state === "RUNNING" &&
      (!row.lease_expires_at || row.lease_expires_at <= new Date())
    ) {
      refresh.state = "failed";
      refresh.message = `This ${label} update expired. Try again.`;
    }
    return {
      game: await repository.gameForRow(prisma, row),
      created: false,
      refresh,
    };
  }

  async function statusForReference(
    reference: Reference,
    context?: StatusContext,
  ) {
    const { identity, game } = await repository.resolve(prisma, reference);
    const row = await repository.findByIdentity(prisma, identity);
    return row
      ? status(row.id, context)
      : { game, created: false, refresh: null };
  }

  return {
    reserve,
    fence,
    complete,
    fail,
    failure,
    metadata,
    status,
    statusForReference,
  };
}
