import { z } from "zod";
import {
  authoritativeStoreThemeKey,
  STORE_THEME_KEYS,
} from "lib/storefront-theme-contract";

export const STORE_PRESENTATION_VERSION = 1 as const;
export const STORE_LAYOUT_PRESETS = ["EDITORIAL"] as const;
export const STORE_PALETTE_IDS = ["MANIFOLD"] as const;
export const STORE_TYPOGRAPHY_IDS = ["MANIFOLD"] as const;
export const STORE_SHAPE_IDS = ["MANIFOLD"] as const;
export { STORE_THEME_KEYS } from "lib/storefront-theme-contract";

const socialUrlSchema = z.string().url().max(2048);

// This is the sole presentation allowlist used by drafts, snapshots and public
// projection. Keep it strict: adding a field is a versioned contract change.
export const storePresentationSchema = z
  .object({
    version: z.literal(STORE_PRESENTATION_VERSION),
    layout_preset: z.enum(STORE_LAYOUT_PRESETS),
    palette_id: z.enum(STORE_PALETTE_IDS),
    typography_id: z.enum(STORE_TYPOGRAPHY_IDS),
    shape_id: z.enum(STORE_SHAPE_IDS),
    tagline: z.string().trim().max(160).nullable(),
    cover_image_url: z.string().url().max(2048).nullable(),
    social_links: z
      .object({
        website: socialUrlSchema.optional(),
        youtube: socialUrlSchema.optional(),
        twitch: socialUrlSchema.optional(),
        x: socialUrlSchema.optional(),
        discord: socialUrlSchema.optional(),
        instagram: socialUrlSchema.optional(),
        bluesky: socialUrlSchema.optional(),
      })
      .strict(),
    theme_key: z.enum(STORE_THEME_KEYS).nullable(),
  })
  .strict();

export type StorePresentation = z.infer<typeof storePresentationSchema>;
export type StorePresentationDraft = Omit<StorePresentation, "theme_key">;

export const DEFAULT_STORE_PRESENTATION: StorePresentationDraft = {
  version: STORE_PRESENTATION_VERSION,
  layout_preset: "EDITORIAL",
  palette_id: "MANIFOLD",
  typography_id: "MANIFOLD",
  shape_id: "MANIFOLD",
  tagline: null,
  cover_image_url: null,
  social_links: {},
};

/**
 * Versioned seam for Sprint 3. The current Store table has no presentation
 * columns, so callers receive strict defaults. Once draft columns land they
 * can be passed here without changing snapshot or public-read contracts.
 * `theme_key` is always derived from the durable slug and cannot be supplied by
 * an owner-controlled payload.
 */
export function resolveDraftPresentation({
  slug,
  presentation = DEFAULT_STORE_PRESENTATION,
}: {
  slug: string;
  presentation?: StorePresentationDraft;
}): StorePresentation {
  return storePresentationSchema.parse({
    ...presentation,
    theme_key: authoritativeStoreThemeKey(slug),
  });
}

export function parseStorePresentationForSlug(
  slug: string,
  value: unknown,
): StorePresentation {
  const parsed = storePresentationSchema.parse(value);
  const authoritativeTheme = authoritativeStoreThemeKey(slug);
  if (parsed.theme_key !== authoritativeTheme) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["theme_key"],
        message: "theme_key does not match the authority for this Store slug",
      },
    ]);
  }
  return parsed;
}
