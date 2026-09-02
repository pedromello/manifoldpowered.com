import { z } from "zod";
import { STORE_THEME_KEYS } from "lib/storefront-theme-contract";
import {
  DEFAULT_STORE_BRAND_TOKENS,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_PRESENTATION_VERSION,
  STORE_SHAPES,
  STORE_SOCIAL_PLATFORMS,
  STORE_TYPOGRAPHIES,
  type StoreSocialPlatform,
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

const socialUrlSchema = z
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
    {
      message: "URL must use https",
    },
  );

const socialLinkShape = Object.fromEntries(
  STORE_SOCIAL_PLATFORMS.map((platform) => [
    platform,
    socialUrlSchema.optional(),
  ]),
) as Record<StoreSocialPlatform, z.ZodOptional<typeof socialUrlSchema>>;

export const storeSocialLinksSchema = z.object(socialLinkShape).strict();

// This is the sole presentation allowlist used by drafts, snapshots and public
// projection. Keep it strict: adding a field is a versioned contract change.
export const storePresentationSchema = z
  .object({
    version: z.literal(STORE_PRESENTATION_VERSION),
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

export type StorePresentation = z.infer<typeof storePresentationSchema>;
export type StorePresentationDraft = Omit<StorePresentation, "theme_key"> & {
  theme_key?: never;
};

export const DEFAULT_STORE_PRESENTATION: StorePresentationDraft = {
  version: STORE_PRESENTATION_VERSION,
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
  social_links = DEFAULT_STORE_PRESENTATION.social_links,
  brand_tokens = DEFAULT_STORE_PRESENTATION.brand_tokens,
}: {
  theme_key?: unknown;
  layout_preset?: unknown;
  tagline?: unknown;
  cover_url?: unknown;
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
