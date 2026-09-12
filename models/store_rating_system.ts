import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "infra/errors";
import authorization from "models/authorization";
import {
  outletRatingSchema,
  ratingFromStorage,
  ratingToStorage,
  suggestedRatingMapping,
  validateRatingMapping,
  type OutletRatingScale,
  type RatingMappingEntry,
  type RatingSystemInput,
  type RatingSystemPreview,
} from "contracts/outlet-rating";

function draftConflict(expected: number, actual: number) {
  return new ConflictError({
    message: "The Outlet draft changed before the rating system was updated.",
    action: "Refresh the Outlet and preview the conversion again.",
    context: {
      expected_draft_revision: expected,
      actual_draft_revision: actual,
    },
  });
}

function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2034") return true;
  if ("kind" in error && error.kind === "TransactionWriteConflict") return true;
  if ("code" in error && ["40001", "40P01"].includes(String(error.code)))
    return true;
  // The pg driver adapter wraps raw-query serialization failures in P2010;
  // its structured cause keeps the conflict kind instead of a SQLSTATE code.
  if (
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null
  ) {
    if (isTransactionConflict(error.meta)) return true;
    if (
      "driverAdapterError" in error.meta &&
      isTransactionConflict(error.meta.driverAdapterError)
    )
      return true;
  }
  return "cause" in error && isTransactionConflict(error.cause);
}

async function readState(
  transaction: Prisma.TransactionClient,
  storeId: string,
  actorUserId: string,
  expectedRevision: number,
) {
  const [outlet, actor, members] = await Promise.all([
    transaction.store.findUnique({ where: { id: storeId } }),
    transaction.user.findUnique({ where: { id: actorUserId } }),
    transaction.storeMember.findMany({ where: { store_id: storeId } }),
  ]);
  if (!outlet) {
    throw new NotFoundError({
      message: "Outlet not found.",
      action: "Check the Outlet and try again.",
    });
  }
  if (
    !actor ||
    !authorization.can(actor, "update:store", { ...outlet, members })
  ) {
    throw new ForbiddenError({
      message:
        "You do not have permission to change this Outlet's rating system.",
      action: "Ask the Outlet owner for editing access.",
    });
  }
  if (outlet.draft_revision !== expectedRevision) {
    throw draftConflict(expectedRevision, outlet.draft_revision);
  }
  const reviews = await transaction.storeGameEditorial.findMany({
    where: { store_id: storeId },
    select: { game_id: true, rating_scale: true, rating_value: true },
  });
  return { outlet, reviews };
}

function conversionMapping(
  source: OutletRatingScale | null,
  input: RatingSystemInput,
  requireMapping: boolean,
): RatingMappingEntry[] {
  if (source === input.target_scale) {
    throw new ValidationError({
      message: "This rating scale is already selected.",
      action: "Choose a different rating scale.",
    });
  }
  if (!source) {
    if (input.mapping?.length) {
      throw new ValidationError({
        message: "An initial rating system has no source values to convert.",
        action: "Choose the rating scale without a conversion mapping.",
      });
    }
    return [];
  }
  if (requireMapping && input.mapping === undefined) {
    throw new ValidationError({
      message: "The complete conversion mapping is required.",
      action:
        "Preview and confirm every source value before applying the new scale.",
    });
  }
  try {
    return validateRatingMapping(
      source,
      input.target_scale,
      input.mapping ?? suggestedRatingMapping(source, input.target_scale),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError({
        message: "The conversion mapping is invalid.",
        action: "Map every source value once to a value in the target scale.",
        context: error.issues,
      });
    }
    throw error;
  }
}

export async function previewRatingSystem(
  storeId: string,
  actorUserId: string,
  input: RatingSystemInput,
): Promise<RatingSystemPreview> {
  return prisma.$transaction(
    async (transaction) => {
      const { outlet, reviews } = await readState(
        transaction,
        storeId,
        actorUserId,
        input.expected_draft_revision,
      );
      const mapping = conversionMapping(outlet.rating_scale, input, false);
      const ratings = reviews
        .map(ratingFromStorage)
        .filter((rating) => rating !== null);
      return {
        source_scale: outlet.rating_scale,
        target_scale: input.target_scale,
        draft_revision: outlet.draft_revision,
        mapping: mapping.map((entry) => ({
          ...entry,
          count: ratings.filter((rating) => rating.value === entry.from).length,
        })),
        rated_count: ratings.length,
        unrated_count: reviews.length - ratings.length,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function applyRatingSystem(
  storeId: string,
  actorUserId: string,
  input: RatingSystemInput,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        // Share the publication lock so snapshots cannot observe half a conversion.
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "stores" WHERE "id" = ${storeId} FOR UPDATE`,
        );
        const { outlet, reviews } = await readState(
          transaction,
          storeId,
          actorUserId,
          input.expected_draft_revision,
        );
        const ratedCount = reviews.filter(
          (review) => review.rating_value !== null,
        ).length;
        const mapping = conversionMapping(
          outlet.rating_scale,
          input,
          ratedCount > 0,
        );
        const changed = await transaction.store.updateMany({
          where: { id: storeId, draft_revision: input.expected_draft_revision },
          data: {
            rating_scale: input.target_scale,
            draft_revision: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          const latest = await transaction.store.findUniqueOrThrow({
            where: { id: storeId },
            select: { draft_revision: true },
          });
          throw draftConflict(
            input.expected_draft_revision,
            latest.draft_revision,
          );
        }
        if (outlet.rating_scale) {
          for (const entry of mapping) {
            const previous = ratingToStorage(
              outletRatingSchema.parse({
                scale: outlet.rating_scale,
                value: entry.from,
              }),
            );
            const next = ratingToStorage(
              outletRatingSchema.parse({
                scale: input.target_scale,
                value: entry.to,
              }),
            );
            await transaction.storeGameEditorial.updateMany({
              where: { store_id: storeId, ...previous },
              data: next,
            });
          }
        }
        return {
          rating_scale: input.target_scale,
          draft_revision: input.expected_draft_revision + 1,
          converted_count: ratedCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isTransactionConflict(error)) {
      const latest = await prisma.store.findUnique({
        where: { id: storeId },
        select: { draft_revision: true },
      });
      throw draftConflict(
        input.expected_draft_revision,
        latest?.draft_revision ?? input.expected_draft_revision,
      );
    }
    throw error;
  }
}
