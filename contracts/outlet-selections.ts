import { z } from "zod";

export const MAX_SELECTION_GAMES = 100;
export const MAX_SELECTION_IMAGES = 6;
export const selectionSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase, hyphenated slug.");

export const selectionImageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      host.includes(".") &&
      !/^[\d.]+$/.test(host) &&
      !host.includes(":") &&
      !/\.(localhost|local|internal|test|invalid)$/.test(host)
    );
  }, "Use an HTTPS image URL on a public hostname, without credentials.");

const gameSlug = z.string().trim().min(1).max(255);
export const selectionGamesSchema = z
  .array(gameSlug)
  .max(MAX_SELECTION_GAMES)
  .refine((slugs) => new Set(slugs).size === slugs.length, {
    message: "Select each game only once.",
  });
export const selectionRevisionSchema = z.number().int().positive().safe();

export const selectionCreateSchema = z
  .object({
    slug: selectionSlugSchema,
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(5000).default(""),
    cover_url: selectionImageUrlSchema.nullable().default(null),
    image_urls: z
      .array(selectionImageUrlSchema)
      .max(MAX_SELECTION_IMAGES)
      .default([]),
    game_slugs: selectionGamesSchema.default([]),
  })
  .strict();

// Do not wrap create-time defaults in optional fields: Zod applies those
// defaults inside partial objects, which would clear fields on a title-only edit.
export const selectionUpdateSchema = z
  .object({
    title: selectionCreateSchema.shape.title.optional(),
    description: z.string().trim().max(5000).optional(),
    cover_url: selectionImageUrlSchema.nullable().optional(),
    image_urls: z
      .array(selectionImageUrlSchema)
      .max(MAX_SELECTION_IMAGES)
      .optional(),
    game_slugs: selectionGamesSchema.optional(),
  })
  .extend({ expected_draft_revision: selectionRevisionSchema })
  .strict()
  .refine(
    (input) =>
      (
        [
          "title",
          "description",
          "cover_url",
          "image_urls",
          "game_slugs",
        ] as const
      ).some((key) => input[key] !== undefined),
    {
      message: "Provide at least one selection field to update.",
    },
  );

export const selectionPublicationSchema = z
  .object({
    action: z.enum(["publish", "unpublish"]),
    expected_draft_revision: selectionRevisionSchema,
  })
  .strict();

export const selectionSnapshotSchema = selectionCreateSchema
  .omit({ slug: true, game_slugs: true })
  .extend({ game_ids: z.array(z.string().min(1)).max(MAX_SELECTION_GAMES) })
  .strict();

export type SelectionSnapshot = z.infer<typeof selectionSnapshotSchema>;
export type SelectionInput = z.infer<typeof selectionCreateSchema>;
export type SelectionUpdate = z.infer<typeof selectionUpdateSchema>;
export type SelectionSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string | null;
  image_urls: string[];
  game_slugs: string[];
  status: "DRAFT" | "PUBLISHED";
  published_revision: number;
  published_at: string | null;
  public_path: string;
  draft_revision?: number;
};

export function selectionPath(storeSlug: string, selectionSlug: string) {
  return `/store/${encodeURIComponent(storeSlug)}/selections/${encodeURIComponent(selectionSlug)}`;
}
