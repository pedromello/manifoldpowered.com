import { z } from "zod";
import { cleanMetadataText } from "lib/seo";
import type { StoreApi } from "components/store/types";
import { SOCIAL_PREVIEW_DESIGN } from "lib/social-preview-version";

export const COMPOSED_PREVIEW_CACHE =
  "public, max-age=0, s-maxage=60, must-revalidate";

const previewGameSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  media: z.object({ banner: z.string().optional() }),
  featured_source: z.enum(["EDITORIAL", "AUTOMATIC"]).optional(),
});
export type PreviewGame = z.infer<typeof previewGameSchema>;
export type PreviewBanner = { slug: string; title: string; image: string };

export function publishedFeaturedGames(
  value: unknown,
  store: StoreApi,
): PreviewGame[] | null {
  const parsed = z
    .object({
      publication: z.object({
        slug: z.string(),
        revision: z.number().int().positive(),
        published_at: z.string(),
      }),
      games: z.array(z.unknown()),
    })
    .safeParse(value);
  if (
    !parsed.success ||
    !store.published_revision ||
    parsed.data.publication.slug !== store.slug ||
    parsed.data.publication.revision !== store.published_revision.revision ||
    parsed.data.publication.published_at !== store.published_at
  )
    return null;
  return previewGames(parsed.data.games, true);
}

export function previewGames(
  value: unknown,
  editorialOnly = false,
): PreviewGame[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const result = previewGameSchema.safeParse(entry);
    if (!result.success) return [];
    const game = result.data;
    if (
      seen.has(game.slug) ||
      (editorialOnly && game.featured_source !== "EDITORIAL")
    )
      return [];
    seen.add(game.slug);
    return [game];
  });
}

/** Preserve editorial order even when downloads finish in a different order. */
export async function loadPreviewBanners(
  games: PreviewGame[],
  load: (url: string) => Promise<string | null>,
): Promise<PreviewBanner[]> {
  const candidates = games.filter((game) => game.media.banner).slice(0, 6);
  const loaded: Array<PreviewBanner | null> = [];
  for (let offset = 0; offset < candidates.length; offset += 3) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 3).map(async (game) => {
        try {
          const image = await load(game.media.banner!);
          return image ? { slug: game.slug, title: game.title, image } : null;
        } catch {
          return null;
        }
      }),
    );
    loaded.push(...batch);
    if (loaded.filter(Boolean).length >= 3) break;
  }
  return loaded
    .filter((banner): banner is PreviewBanner => banner !== null)
    .slice(0, 3);
}

/** A conservative width estimate avoids clipping without a font dependency. */
function textWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((width, char) => {
    const unit = /[ilI.,:;'!|]/.test(char)
      ? 0.28
      : /[mwMW@]/.test(char)
        ? 0.93
        : /\s/.test(char)
          ? 0.3
          : /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9]/.test(char)
            ? 0.7
            : 0.57;
    return width + unit * fontSize;
  }, 0);
}

export function fitPreviewText(
  value: string,
  width: number,
  maxLines: number,
  maxFont: number,
  minFont: number,
  maxHeight = Infinity,
): { lines: string[]; fontSize: number } {
  const clean = cleanMetadataText(value, 1000);
  if (!clean) return { lines: [], fontSize: maxFont };
  let lines: string[] = [];
  let fontSize = maxFont;
  for (; fontSize >= minFont; fontSize--) {
    lines = [""];
    for (const word of clean.split(" ")) {
      const last = lines.length - 1;
      const combined = lines[last] ? `${lines[last]} ${word}` : word;
      if (textWidth(combined, fontSize) <= width * 0.94) {
        lines[last] = combined;
        continue;
      }
      if (lines[last]) lines.push("");
      // Break an unspaced title too; a single long word must not escape its box.
      for (const char of Array.from(word)) {
        const index = lines.length - 1;
        if (textWidth(lines[index] + char, fontSize) > width * 0.94)
          lines.push(char);
        else lines[index] += char;
      }
    }
    if (lines.length <= maxLines && lines.length * fontSize * 1.12 <= maxHeight)
      return { lines, fontSize };
  }
  lines = lines.slice(0, maxLines);
  let last = lines.at(-1) ?? "";
  while (textWidth(`${last}…`, minFont) > width * 0.94)
    last = last.slice(0, -1);
  lines[lines.length - 1] = `${last.trimEnd()}…`;
  return { lines, fontSize: minFont };
}

/** Hash the actual render input, including loaded image bytes and fallbacks. */
export async function composedPreviewHeaders(
  kind: "selection" | "outlet",
  locale: string,
  input: unknown,
): Promise<Record<string, string>> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    "Cache-Control": COMPOSED_PREVIEW_CACHE,
    "Content-Disposition": "inline",
    ETag: `W/"og-${kind}-${SOCIAL_PREVIEW_DESIGN}-${locale}-${hash}"`,
  };
}
