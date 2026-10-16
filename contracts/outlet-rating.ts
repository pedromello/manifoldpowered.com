import { z } from "zod";

export const OUTLET_RATING_SCALES = ["STARS", "NUMERIC_10", "TIER"] as const;
export type OutletRatingScale = (typeof OUTLET_RATING_SCALES)[number];

/** Ascending order is the native tier value and the order of minimum filters. */
export const OUTLET_RATING_TIERS = [
  "F",
  "D-",
  "D",
  "D+",
  "C-",
  "C",
  "C+",
  "B-",
  "B",
  "B+",
  "A-",
  "A",
  "A+",
  "S-",
  "S",
  "S+",
] as const;
export type OutletRatingTier = (typeof OUTLET_RATING_TIERS)[number];
export type OutletRatingValue = number | OutletRatingTier;

export const outletRatingScaleSchema = z.enum(OUTLET_RATING_SCALES);
const halfPoints = (maximum: number) =>
  z.number().min(0).max(maximum).multipleOf(0.5);
export const outletRatingSchema = z.discriminatedUnion("scale", [
  z.object({ scale: z.literal("STARS"), value: halfPoints(5) }).strict(),
  z.object({ scale: z.literal("NUMERIC_10"), value: halfPoints(10) }).strict(),
  z
    .object({ scale: z.literal("TIER"), value: z.enum(OUTLET_RATING_TIERS) })
    .strict(),
]);
export type OutletRating = z.infer<typeof outletRatingSchema>;

export type StoredOutletRating = {
  rating_scale: OutletRatingScale | null;
  rating_value: number | null;
};

export function ratingValues(scale: OutletRatingScale): OutletRatingValue[] {
  return scale === "TIER"
    ? [...OUTLET_RATING_TIERS]
    : Array.from(
        { length: scale === "STARS" ? 11 : 21 },
        (_, index) => index / 2,
      );
}

export function ratingToStorage(rating: OutletRating): {
  rating_scale: OutletRatingScale;
  rating_value: number;
};
export function ratingToStorage(
  rating: OutletRating | null,
): StoredOutletRating;
export function ratingToStorage(
  rating: OutletRating | null,
): StoredOutletRating {
  if (rating === null) return { rating_scale: null, rating_value: null };
  const parsed = outletRatingSchema.parse(rating);
  return {
    rating_scale: parsed.scale,
    rating_value:
      parsed.scale === "TIER"
        ? OUTLET_RATING_TIERS.indexOf(parsed.value)
        : parsed.value * 2,
  };
}

export function ratingFromStorage(row: {
  rating_scale?: OutletRatingScale | null;
  rating_value?: number | null;
}): OutletRating | null {
  if (row.rating_scale == null && row.rating_value == null) return null;
  const value = z.number().int().min(0).parse(row.rating_value);
  return outletRatingSchema.parse({
    scale: row.rating_scale,
    value: row.rating_scale === "TIER" ? OUTLET_RATING_TIERS[value] : value / 2,
  });
}

export function formatOutletRating(
  rating: OutletRating,
  locale = "en",
): string {
  if (rating.scale === "TIER") return rating.value;
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(rating.value);
  return rating.scale === "STARS" ? `${number}/5 ★` : `${number}/10`;
}

/** Conversion suggestions only: never use these anchors to order or filter tiers. */
export const TIER_NUMERIC_ANCHORS: Record<OutletRatingTier, number> = {
  F: 0,
  "D-": 3,
  D: 3.5,
  "D+": 4,
  "C-": 4.5,
  C: 5,
  "C+": 5.5,
  "B-": 6.5,
  B: 7,
  "B+": 7.5,
  "A-": 7.5,
  A: 8,
  "A+": 8.5,
  "S-": 9,
  S: 9.5,
  "S+": 10,
};

export function convertOutletRating(
  rating: OutletRating,
  target: OutletRatingScale,
): OutletRating {
  if (rating.scale === target) return { ...rating };
  // All arithmetic uses half-point units on the 0–10 scale. In particular,
  // converting to stars never first rounds through a suggested tier.
  const halfUnits =
    rating.scale === "TIER"
      ? TIER_NUMERIC_ANCHORS[rating.value] * 2
      : rating.value * (rating.scale === "STARS" ? 4 : 2);
  if (target === "NUMERIC_10") return { scale: target, value: halfUnits / 2 };
  if (target === "STARS")
    return { scale: target, value: Math.floor((halfUnits + 1) / 2) / 2 };
  let closest: OutletRatingTier = "F";
  let distance = Infinity;
  for (const tier of OUTLET_RATING_TIERS) {
    const candidateDistance = Math.abs(
      TIER_NUMERIC_ANCHORS[tier] * 2 - halfUnits,
    );
    // Strictly less keeps the lower tier on ties, including repeated anchors.
    if (candidateDistance < distance) {
      closest = tier;
      distance = candidateDistance;
    }
  }
  return { scale: "TIER", value: closest };
}

const ratingValueSchema = z.union([
  halfPoints(10),
  z.enum(OUTLET_RATING_TIERS),
]);
export const ratingMappingEntrySchema = z
  .object({
    from: ratingValueSchema,
    to: ratingValueSchema,
  })
  .strict();
export type RatingMappingEntry = z.infer<typeof ratingMappingEntrySchema>;
export const ratingMappingSchema = z.array(ratingMappingEntrySchema).max(21);

export function suggestedRatingMapping(
  source: OutletRatingScale,
  target: OutletRatingScale,
): RatingMappingEntry[] {
  return ratingValues(source).map((value) => ({
    from: value,
    to: convertOutletRating(
      outletRatingSchema.parse({ scale: source, value }),
      target,
    ).value,
  }));
}

export function validateRatingMapping(
  source: OutletRatingScale,
  target: OutletRatingScale,
  mapping: RatingMappingEntry[],
): RatingMappingEntry[] {
  return ratingMappingSchema
    .superRefine((entries, context) => {
      const expected = ratingValues(source);
      const actual = new Set(entries.map(({ from }) => from));
      if (
        entries.length !== expected.length ||
        actual.size !== entries.length ||
        expected.some((value) => !actual.has(value))
      ) {
        context.addIssue({
          code: "custom",
          message: "The mapping must contain every source value exactly once.",
        });
      }
      for (const [index, entry] of entries.entries()) {
        if (
          !outletRatingSchema.safeParse({ scale: target, value: entry.to })
            .success
        ) {
          context.addIssue({
            code: "custom",
            path: [index, "to"],
            message: "The mapped value must belong to the target scale.",
          });
        }
      }
    })
    .parse(mapping);
}

export const ratingSystemInputSchema = z
  .object({
    target_scale: outletRatingScaleSchema,
    expected_draft_revision: z.number().int().min(1),
    mapping: ratingMappingSchema.optional(),
  })
  .strict();
export type RatingSystemInput = z.infer<typeof ratingSystemInputSchema>;

export const ratingSystemPreviewSchema = z.object({
  source_scale: outletRatingScaleSchema.nullable(),
  target_scale: outletRatingScaleSchema,
  draft_revision: z.number().int().min(1),
  mapping: z.array(
    ratingMappingEntrySchema.extend({ count: z.number().int().min(0) }),
  ),
  rated_count: z.number().int().min(0),
  unrated_count: z.number().int().min(0),
});
export type RatingSystemPreview = z.infer<typeof ratingSystemPreviewSchema>;

export const ratingSystemResultSchema = z.object({
  rating_scale: outletRatingScaleSchema,
  draft_revision: z.number().int().min(1),
  converted_count: z.number().int().min(0),
});

export const outletEditorialResponseSchema = z.object({
  review: z
    .object({
      headline: z.string().max(120).nullable(),
      body: z.string().max(2000),
      rating: outletRatingSchema.nullable(),
    })
    .nullable(),
  draft_revision: z.number().int().min(1).optional(),
});
