import { z } from "zod";

const locale = z.enum(["en", "pt-BR"]).default("pt-BR");
const slug = z.string().trim().min(1).max(255);
const page = z.number().int().min(1).max(100).default(1);
const limit = z.number().int().min(1).max(20).default(5);

export const catalogSearchSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    tags: z.array(z.string().trim().min(1).max(64)).max(5).optional(),
    page,
    limit,
    locale,
  })
  .strict();
export const catalogDetailSchema = z.object({ slug, locale }).strict();
export const catalogReviewsSchema = z
  .object({
    slug,
    locale,
    page,
    limit: limit.default(10),
    recommendation: z.enum(["all", "positive", "negative"]).default("all"),
    sort: z.enum(["newest", "oldest"]).default("newest"),
  })
  .strict();
export const catalogPresentationSchema = z
  .object({
    view: z.enum(["list", "detail", "reviews"]),
    slugs: z.array(slug).min(1).max(5),
    locale,
    tags: catalogSearchSchema.shape.tags,
    page,
    limit: limit.default(10),
    recommendation: catalogReviewsSchema.shape.recommendation,
    sort: catalogReviewsSchema.shape.sort,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.slugs).size !== input.slugs.length ||
      (input.view !== "list" && input.slugs.length !== 1)
    )
      context.addIssue({
        code: "custom",
        path: ["slugs"],
        message: "Use distinct slugs; detail/reviews require exactly one game.",
      });
  });
export const catalogGameSchema = z
  .object({
    slug: z.string(),
    title: z.string().max(255),
    description: z.string().max(600),
    tags: z.array(z.string().max(64)).max(10),
    matching_tags: z.array(z.string().max(64)).max(5).optional(),
    launch_date: z.iso.datetime().nullable(),
    media: z
      .object({
        images: z.array(z.url()).max(6),
        cover: z.url().nullable().optional(),
        screenshots: z.array(z.url()).max(6).optional(),
        videos: z
          .array(
            z
              .object({
                url: z.url(),
                kind: z.enum(["file", "external"]),
              })
              .strict(),
          )
          .max(2),
      })
      .strict(),
    review_summary: z
      .object({
        total: z.number().int().nonnegative(),
        positive: z.number().int().nonnegative(),
        negative: z.number().int().nonnegative(),
        source: z.literal("catalog_counters"),
      })
      .strict(),
  })
  .strict();
export const catalogPaginationSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    pages: z.number().int(),
  })
  .strict();
export const catalogSearchResultSchema = z
  .object({
    games: z.array(catalogGameSchema),
    pagination: catalogPaginationSchema,
    locale,
  })
  .strict();
export const catalogDetailResultSchema = z
  .object({
    game: catalogGameSchema,
    locale,
  })
  .strict();
export const catalogReviewSchema = z
  .object({
    reference: z.string(),
    message: z.string().max(3000),
    recommended: z.boolean(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .strict();
export const catalogReviewsResultSchema = z
  .object({
    game: catalogGameSchema,
    locale,
    reviews: z.array(catalogReviewSchema),
    pagination: catalogPaginationSchema,
    sample: z
      .object({
        returned: z.number().int(),
        recommendation: z.enum(["all", "positive", "negative"]),
        sort: z.enum(["newest", "oldest"]),
      })
      .strict(),
  })
  .strict();
export const catalogSelectionResultSchema = z
  .object({ games: z.array(catalogGameSchema).min(1).max(5), locale })
  .strict();
export const catalogPresentationResultSchema = z.union([
  catalogSelectionResultSchema,
  catalogDetailResultSchema,
  catalogReviewsResultSchema,
]);
export type CatalogGame = z.infer<typeof catalogGameSchema>;
export type CatalogReview = z.infer<typeof catalogReviewSchema>;
export type CatalogReviewsResult = z.infer<typeof catalogReviewsResultSchema>;
