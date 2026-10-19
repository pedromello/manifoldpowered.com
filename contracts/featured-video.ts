import { z } from "zod";

export const featuredVideoSchema = z
  .object({
    provider: z.literal("YOUTUBE"),
    video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  })
  .strict();
export type FeaturedVideo = z.infer<typeof featuredVideoSchema>;

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    let id: string | null = null;
    if (
      url.hostname === "youtu.be" &&
      /^\/[A-Za-z0-9_-]{11}$/.test(url.pathname)
    )
      id = url.pathname.slice(1);
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
        url.hostname,
      ) &&
      url.pathname === "/watch" &&
      url.searchParams.getAll("v").length === 1
    )
      id = url.searchParams.get("v");
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export const featuredVideoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (url) => youtubeVideoId(url) !== null,
    "Use an HTTPS YouTube watch or youtu.be video URL.",
  );

export function featuredVideoFromId(
  id: string | null | undefined,
): FeaturedVideo | null {
  return id
    ? featuredVideoSchema.parse({ provider: "YOUTUBE", video_id: id })
    : null;
}
export function featuredVideoUrl(
  video: FeaturedVideo | null | undefined,
): string | null {
  return video ? `https://www.youtube.com/watch?v=${video.video_id}` : null;
}
