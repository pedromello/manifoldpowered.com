import { z } from "zod";
import {
  featuredVideoSchema,
  featuredVideoFromId,
} from "contracts/featured-video";
import { STORE_THEME_KEYS } from "lib/storefront-theme-contract";
import {
  DEFAULT_STORE_BRAND_TOKENS,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_PRESENTATION_VERSION,
  STORE_SHAPES,
  STORE_SOCIAL_PLATFORMS,
  STORE_TYPOGRAPHIES,
} from "contracts/store-presentation";

export {
  DEFAULT_STORE_BRAND_TOKENS,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_PRESENTATION_VERSION,
  STORE_SHAPES,
  STORE_SOCIAL_PLATFORMS,
  STORE_THEME_KEYS,
  STORE_TYPOGRAPHIES,
};

import {
  httpsUrlSchema as socialUrlSchema,
  storeSocialLinksSchema,
} from "contracts/creator-requests";
export { storeSocialLinksSchema };

// This is the sole presentation allowlist used by drafts, snapshots and public
// projection. Keep it strict: adding a field is a versioned contract change.
const currentPresentationSchema = z
  .object({
    version: z.literal(STORE_PRESENTATION_VERSION),
    featured_video: featuredVideoSchema.nullable().default(null),
    // Null is the durable legacy value and renders as the classic storefront.
    layout_preset: z.enum(STORE_LAYOUT_PRESETS).nullable(),
    tagline: z.string().trim().max(160).nullable(),
    cover_image_url: socialUrlSchema.nullable(),
    social_links: storeSocialLinksSchema,
    brand_tokens: z
      .object({
        palette: z.enum(STORE_PALETTES),
        typography: z.enum(STORE_TYPOGRAPHIES),
        shape: z.enum(STORE_SHAPES),
      })
      .strict(),
    theme_key: z.enum(STORE_THEME_KEYS).nullable(),
  })
  .strict();

const legacyPresentationSchema = currentPresentationSchema
  .omit({ featured_video: true })
  .extend({ version: z.literal(1) });
export const storePresentationSchema = z
  .union([currentPresentationSchema, legacyPresentationSchema])
  .transform((value) => ({
    ...value,
    version: STORE_PRESENTATION_VERSION,
    featured_video: "featured_video" in value ? value.featured_video : null,
  }));

export type StorePresentation = z.infer<typeof storePresentationSchema>;
export type StorePresentationDraft = Omit<StorePresentation, "theme_key"> & {
  theme_key?: never;
};

export const DEFAULT_STORE_PRESENTATION: StorePresentationDraft = {
  version: STORE_PRESENTATION_VERSION,
  featured_video: null,
  layout_preset: null,
  tagline: null,
  cover_image_url: null,
  social_links: {},
  brand_tokens: DEFAULT_STORE_BRAND_TOKENS,
};

/**
 * One strict projection is shared by draft previews and immutable revisions.
 * `theme_key` is read from the platform-controlled Store column and is never
 * part of the owner-facing update schema.
 */
export function resolveDraftPresentation({
  theme_key = null,
  layout_preset = DEFAULT_STORE_PRESENTATION.layout_preset,
  tagline = DEFAULT_STORE_PRESENTATION.tagline,
  cover_url = DEFAULT_STORE_PRESENTATION.cover_image_url,
  featured_video_id = null,
  social_links = DEFAULT_STORE_PRESENTATION.social_links,
  brand_tokens = DEFAULT_STORE_PRESENTATION.brand_tokens,
}: {
  theme_key?: unknown;
  layout_preset?: unknown;
  tagline?: unknown;
  cover_url?: unknown;
  featured_video_id?: unknown;
  social_links?: unknown;
  brand_tokens?: unknown;
  // Compatibility-only input. It is deliberately ignored and is not an
  // authority for theme selection.
  slug?: string;
} = {}): StorePresentation {
  return storePresentationSchema.parse({
    version: STORE_PRESENTATION_VERSION,
    theme_key,
    layout_preset,
    tagline,
    cover_image_url: cover_url,
    featured_video: featuredVideoFromId(
      typeof featured_video_id === "string" ? featured_video_id : null,
    ),
    social_links,
    brand_tokens,
  });
}

export function parseStorePresentationForSlug(
  _slug: string,
  value: unknown,
): StorePresentation {
  return storePresentationSchema.parse(value);
}
