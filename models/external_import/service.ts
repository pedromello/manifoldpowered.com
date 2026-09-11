import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import type {
  ImportAudit,
  ImportDependencies,
  ImportResult,
} from "./contracts";

export function createStoreImportService<
  Reference,
  Lease extends { state: string },
  Transaction,
>(dependencies: ImportDependencies<Reference, Lease, Transaction>) {
  const { strategy, attempts, coordination } = dependencies;
  return async function importGame({
    userId,
    input,
    isAdmin = false,
  }: {
    userId: string;
    input: string;
    isAdmin?: boolean;
  }): Promise<ImportResult> {
    const reference = strategy.parseReference(input);
    const attempt = await attempts.reserve(userId, reference, isAdmin);
    const managed = await dependencies.managedGame(reference);
    if (managed) {
      await attempts.finish(attempt.id, "SKIPPED_MANAGED");
      return { game: managed, created: false, refresh: null };
    }
    const reservation = await coordination
      .reserve(reference)
      .catch(async (error: unknown) => {
        await attempts.finish(attempt.id, "CAPACITY_UNAVAILABLE");
        throw error;
      });
    if (!reservation.acquired) {
      await attempts.finish(
        attempt.id,
        reservation.row.state === "RUNNING"
          ? "SHARED_IN_PROGRESS"
          : reservation.row.state === "FAILED"
            ? "CACHED_FAILURE"
            : "CACHE_HIT",
      );
      if (reservation.row.state === "FAILED")
        throw coordination.failure(reservation.row);
      return {
        game: reservation.game,
        created: false,
        refresh: coordination.metadata(reservation.row, true),
      };
    }
    const audit: ImportAudit = {
      regionalOutcomes: {},
      failureOutcome: "SERVICE_ERROR",
    };
    try {
      // All HTTP work finishes before opening the short, fenced write transaction.
      const snapshot = await strategy.fetchSnapshot(reference, audit);
      audit.failureOutcome = "INVALID_DATA";
      const result = await dependencies.transaction(async (tx) => {
        await coordination.fence(tx, reservation.row);
        const saved = await dependencies.persist(tx, snapshot);
        const completed = await coordination.complete(
          tx,
          reservation.row,
          saved.game,
          audit.regionalOutcomes,
          reference,
        );
        return { ...saved, refresh: coordination.metadata(completed) };
      });
      await attempts.finish(attempt.id, "SUCCESS", audit);
      return result;
    } catch (error) {
      const reported =
        error instanceof NotFoundError ||
        error instanceof ServiceError ||
        error instanceof UnsupportedContentError ||
        error instanceof ValidationError
          ? error
          : new ServiceError({
              message: `${dependencies.label} import failed.`,
              action: "Try again later.",
              cause: error,
            });
      await coordination.fail(
        reservation.row,
        reported,
        audit.regionalOutcomes,
      );
      await attempts.finish(attempt.id, audit.failureOutcome, audit, error);
      throw reported;
    }
  };
}
