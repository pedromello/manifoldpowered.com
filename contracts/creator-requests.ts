/** Pure API inputs shared by the website and the agent CLI. */
import { z } from "zod";
import { featuredVideoUrlSchema } from "./featured-video";
import {
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_SHAPES,
  STORE_SOCIAL_PLATFORMS,
  STORE_TYPOGRAPHIES,
} from "./store-presentation";

export const userSchema = z.object({
  username: z.string().min(1).max(30),
  email: z.email(),
  password: z.string().min(1).nullable(),
});
export const requestOtpSchema = z.object({ login: z.string().trim().min(1) });
export const verifyOtpSchema = z.object({
  login: z.string().trim().min(1),
  code: z.string().length(6),
});
export const passwordLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const steamImportRequestSchema = z.object({
  steam_app_id: z
    .string()
    .max(20)
    .regex(/^[1-9]\d*$/, "steam_app_id must be a positive integer string"),
});
export const nintendoImportRequestSchema = z
  .object({ eshop_url: z.string().max(2048) })
  .strict();
export const studioSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  logo_url: z.string().url().max(2048).optional(),
  is_publisher: z.boolean().default(false),
});
export const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must use https" },
  );
const socialLinkShape = Object.fromEntries(
  STORE_SOCIAL_PLATFORMS.map((platform) => [
    platform,
    httpsUrlSchema.optional(),
  ]),
) as Record<
  (typeof STORE_SOCIAL_PLATFORMS)[number],
  z.ZodOptional<typeof httpsUrlSchema>
>;
export const storeSocialLinksSchema = z.object(socialLinkShape).strict();
export const storeBrandTokensSchema = z
  .object({
    palette: z.enum(STORE_PALETTES),
    typography: z.enum(STORE_TYPOGRAPHIES),
    shape: z.enum(STORE_SHAPES),
  })
  .strict();
export const storeSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).nullable().optional(),
    logo_url: httpsUrlSchema.nullable().optional(),
    catalog_mode: z.enum(["UNDECIDED", "ALL", "SELECTED"]).optional(),
    layout_preset: z.enum(STORE_LAYOUT_PRESETS).nullable().optional(),
    tagline: z.string().trim().max(160).nullable().optional(),
    cover_url: httpsUrlSchema.nullable().optional(),
    featured_video_url: featuredVideoUrlSchema.nullable().optional(),
    social_links: storeSocialLinksSchema.nullable().optional(),
    brand_tokens: storeBrandTokensSchema.nullable().optional(),
  })
  .strict();
export const storeUpdateSchema = storeSchema
  .partial()
  .extend({
    catalog_mode: z.enum(["UNDECIDED", "ALL", "SELECTED"]).optional(),
  })
  .strict();
export const STORE_PUBLICATION_ACTIONS = ["publish", "unpublish"] as const;
export const storePublicationActionSchema = z
  .object({
    action: z.enum(STORE_PUBLICATION_ACTIONS),
    expected_draft_revision: z.number().int().min(1),
  })
  .strict();
export const catalogModeSchema = z.object({
  catalog_mode: z.enum(["ALL", "SELECTED"]),
  expected_draft_revision: z.number().int().positive(),
});
export const creatorSelectionSchema = z.discriminatedUnion("strategy", [
  z
    .object({
      strategy: z.literal("FOCUSED"),
      tags: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
      game_slugs: z.array(z.string().trim().min(1).max(255)).max(100),
      expected_draft_revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      strategy: z.literal("HANDPICKED"),
      tags: z.array(z.string().trim().min(1).max(100)).max(20),
      game_slugs: z
        .array(z.string().trim().min(1).max(255))
        .min(5)
        .max(100)
        .refine((slugs) => new Set(slugs).size === slugs.length, {
          message: "game_slugs must be unique",
        }),
      expected_draft_revision: z.number().int().positive(),
    })
    .strict(),
]);
export const MAX_FEATURED_GAMES = 3;
export const MAX_RECOMMENDATION_REASON_LENGTH = 240;
export const recommendationSchema = z.object({
  game_slug: z.string().trim().min(1).max(255),
  recommendation_reason: z
    .string()
    .trim()
    .max(MAX_RECOMMENDATION_REASON_LENGTH)
    .nullish()
    .transform((reason) => reason || null),
});
const recommendationsSchema = z
  .array(recommendationSchema)
  .min(1)
  .max(MAX_FEATURED_GAMES)
  .superRefine((recommendations, context) => {
    if (
      new Set(recommendations.map(({ game_slug }) => game_slug)).size !==
      recommendations.length
    )
      context.addIssue({
        code: "custom",
        path: [],
        message: "Featured games must be unique.",
      });
  });
export const featuredGameSelectionSchema = z.union([
  z.object({
    recommendations: recommendationsSchema,
    expected_draft_revision: z.number().int().min(1),
  }),
  z
    .object({
      game_slugs: z
        .array(z.string().trim().min(1).max(255))
        .min(1)
        .max(MAX_FEATURED_GAMES),
      expected_draft_revision: z.number().int().min(1),
    })
    .transform(({ game_slugs, expected_draft_revision }) => ({
      recommendations: game_slugs.map((game_slug) => ({
        game_slug,
        recommendation_reason: null,
      })),
      expected_draft_revision,
    }))
    .superRefine(({ recommendations }, context) => {
      if (
        new Set(recommendations.map(({ game_slug }) => game_slug)).size !==
        recommendations.length
      )
        context.addIssue({
          code: "custom",
          path: ["game_slugs"],
          message: "Featured games must be unique.",
        });
    }),
]);
