import { prisma } from "infra/database";
import type { Prisma } from "generated/prisma/client";
import { TooManyRequestsError } from "infra/errors";
import type { ImportAudit, ImportOutcome } from "./contracts";

export function createImportAttempts<Reference>(repository: {
  label: string;
  userLock(userId: string): string;
  count(
    tx: Prisma.TransactionClient,
    userId: string,
    since: Date,
  ): Promise<number>;
  create(
    tx: Prisma.TransactionClient,
    userId: string,
    reference: Reference,
  ): Promise<{ id: string }>;
  finish(
    id: string,
    outcome: ImportOutcome,
    audit?: ImportAudit,
    error?: unknown,
  ): Promise<void>;
}) {
  return {
    async reserve(userId: string, reference: Reference, isAdmin: boolean) {
      return prisma.$transaction(async (tx) => {
        if (!isAdmin) {
          const lock = repository.userLock(userId);
          await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${lock}))) AS user_lock`;
          if (
            (await repository.count(
              tx,
              userId,
              new Date(Date.now() - 3600000),
            )) >= 20
          )
            throw new TooManyRequestsError({
              message: `${repository.label} import limit exceeded.`,
              action: `Wait before importing another ${repository.label} game.`,
            });
        }
        return repository.create(tx, userId, reference);
      });
    },
    finish: repository.finish,
  };
}
