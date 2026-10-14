import { z } from "zod";

export const reviewInputSchema = z.object({
  slug: z.string().min(1),
  message: z.string().trim().min(1).max(3000),
  recommended: z.boolean(),
});
export const MAX_EDITORIAL_HEADLINE_LENGTH = 120;
export const MAX_EDITORIAL_BODY_LENGTH = 2000;
export const storeGameEditorialInputSchema = z
  .object({
    headline: z
      .string()
      .trim()
      .max(MAX_EDITORIAL_HEADLINE_LENGTH)
      .nullish()
      .transform((value) => value || null),
    body: z.string().trim().min(1).max(MAX_EDITORIAL_BODY_LENGTH),
    expected_draft_revision: z.number().int().positive(),
  })
  .strict();
export const storeGameEditorialDeleteSchema = z
  .object({ expected_draft_revision: z.number().int().positive() })
  .strict();
export const tagFilterSchema = z.object({
  tag: z.string().min(1).max(100),
  mode: z.enum(["WHITELIST", "BLACKLIST"]),
  expected_draft_revision: z.number().int().positive().optional(),
});
export const tagFilterModeSchema = tagFilterSchema.pick({
  mode: true,
  expected_draft_revision: true,
});
export const expectedRevisionSchema = z.object({
  expected_draft_revision: z.number().int().positive(),
});
export const optionalExpectedRevisionSchema = expectedRevisionSchema.partial();
export const tagFilterPreviewSchema = z
  .object({
    tag: z.string().min(1).max(100),
    action: z.enum(["UPSERT", "REMOVE"]),
    mode: z.enum(["WHITELIST", "BLACKLIST"]).optional(),
    expected_draft_revision: z.number().int().positive(),
  })
  .refine((data) => data.action === "REMOVE" || data.mode !== undefined, {
    message: "mode is required when previewing an upsert",
    path: ["mode"],
  });
export const gameOverrideSchema = z.object({
  game_slug: z.string().min(1),
  visibility: z.enum(["SHOW", "HIDE"]),
  expected_draft_revision: z.number().int().positive().optional(),
});
export const gameOverrideVisibilitySchema = gameOverrideSchema.pick({
  visibility: true,
  expected_draft_revision: true,
});
export const bulkCurationPreviewSchema = z.object({
  action: z.enum(["SHOW", "HIDE", "PIN_SHOW"]),
  game_slugs: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
  expected_draft_revision: z.number().int().positive(),
});
export const bulkCurationSchema = bulkCurationPreviewSchema.extend({
  operation_id: z.uuid(),
  request_fingerprint: z.string().length(64),
  game_slugs: bulkCurationPreviewSchema.shape.game_slugs.refine(
    (slugs) => new Set(slugs).size === slugs.length,
    { message: "game_slugs must be unique" },
  ),
});
