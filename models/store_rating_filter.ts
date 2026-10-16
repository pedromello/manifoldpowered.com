import { z } from "zod";
import type { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import {
  outletRatingScaleSchema,
  outletRatingSchema,
  ratingToStorage,
  type OutletRating,
} from "contracts/outlet-rating";
import type { StorefrontStore } from "models/store";

const querySchema = z
  .object({
    rating_scale: outletRatingScaleSchema.optional(),
    rating_op: z.enum(["eq", "gte"]).optional(),
    rating_value: z.string().min(1).max(16).optional(),
  })
  .strict()
  .refine(
    (query) => {
      const count = Object.values(query).filter(
        (value) => value !== undefined,
      ).length;
      return count === 0 || count === 3;
    },
    { message: "A rating filter requires a scale, operator, and value." },
  );

export interface OutletRatingFilter {
  rating: OutletRating;
  operator: "eq" | "gte";
}

export function parseOutletRatingFilter(
  query: Record<string, unknown>,
): OutletRatingFilter | null {
  const parsed = querySchema.safeParse({
    rating_scale: query.rating_scale,
    rating_op: query.rating_op,
    rating_value: query.rating_value,
  });
  if (!parsed.success) {
    throw new ValidationError({
      message: "Invalid Outlet rating filter.",
      action: "Choose a rating scale, comparison, and valid value.",
      context: parsed.error.issues,
    });
  }
  const { rating_scale, rating_op, rating_value } = parsed.data;
  if (!rating_scale || !rating_op || rating_value === undefined) return null;
  const numericValue = /^\d+(?:\.\d+)?$/.test(rating_value)
    ? Number(rating_value)
    : NaN;
  const rating = outletRatingSchema.safeParse({
    scale: rating_scale,
    value: rating_scale === "TIER" ? rating_value : numericValue,
  });
  if (!rating.success) {
    throw new ValidationError({
      message: "Invalid Outlet rating filter value.",
      action: "Choose a value supported by the selected rating scale.",
      context: rating.error.issues,
    });
  }
  return { rating: rating.data, operator: rating_op };
}

/** Select ids from the same revision as the badges, before game pagination. */
export async function getOutletRatingWhere(
  outlet: StorefrontStore,
  filter: OutletRatingFilter | null,
): Promise<Prisma.GameWhereInput> {
  if (!filter) return {};
  if (outlet.rating_scale !== filter.rating.scale) {
    throw new ValidationError({
      message: "This rating filter uses a different Outlet rating scale.",
      action:
        "Clear the rating filter and choose a value in the current scale.",
      context: {
        code: "RATING_SCALE_MISMATCH",
        rating_scale: outlet.rating_scale,
      },
    });
  }
  const stored = ratingToStorage(filter.rating);
  const ratingWhere = {
    rating_scale: stored.rating_scale,
    rating_value:
      filter.operator === "eq"
        ? stored.rating_value
        : { gte: stored.rating_value },
  };
  const rows =
    outlet.storefront_source === "REVISION"
      ? await prisma.storeRevisionGameRating.findMany({
          where: { revision_id: outlet.published_revision!.id, ...ratingWhere },
          select: { game_id: true },
        })
      : await prisma.storeGameEditorial.findMany({
          where: { store_id: outlet.id, ...ratingWhere },
          select: { game_id: true },
        });
  return { id: { in: rows.map(({ game_id }) => game_id) } };
}
