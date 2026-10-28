import { z } from "zod";

export const MAX_VIDEO_START_SECONDS = 604800;
export const featuredVideoSchema = z
  .object({
    provider: z.literal("YOUTUBE"),
    video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    start_seconds: z
      .number()
      .int()
      .min(0)
      .max(MAX_VIDEO_START_SECONDS)
      .optional(),
  })
  .strict();
export type FeaturedVideo = z.infer<typeof featuredVideoSchema>;

function startSeconds(value: string): number | null {
  if (/^\d{1,6}$/.test(value)) {
    const seconds = Number(value);
    return seconds <= MAX_VIDEO_START_SECONDS ? seconds : null;
  }
  const parts = /^(?:(\d{1,6})h)?(?:(\d{1,6})m)?(?:(\d{1,6})s)?$/.exec(value);
  if (!parts || !value) return null;
  const seconds =
    Number(parts[1] ?? 0) * 3600 +
    Number(parts[2] ?? 0) * 60 +
    Number(parts[3] ?? 0);
  return seconds <= MAX_VIDEO_START_SECONDS ? seconds : null;
}

export function youtubeVideo(value: string): FeaturedVideo | null {
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
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const times = [
      ...url.searchParams.getAll("t"),
      ...url.searchParams.getAll("start"),
    ];
    if (times.length > 1) return null;
    const start = times.length ? startSeconds(times[0]) : 0;
    if (start === null) return null;
    return {
      provider: "YOUTUBE",
      video_id: id,
      ...(start ? { start_seconds: start } : {}),
    };
  } catch {
    return null;
  }
}
export function youtubeVideoId(value: string): string | null {
  return youtubeVideo(value)?.video_id ?? null;
}

export function featuredVideoFields(value: string | null | undefined) {
  const video = value ? youtubeVideo(value) : null;
  return {
    featured_video_id: video?.video_id ?? null,
    featured_video_start_seconds: video?.start_seconds ?? 0,
  };
}
export const featuredVideoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (url) => youtubeVideoId(url) !== null,
    "Use an HTTPS YouTube watch or youtu.be video URL.",
  )
  .describe(
    "HTTPS YouTube video URL. Optional t=68, t=1m8s or start=68 preserves the start time; tracking parameters are discarded.",
  );

export function featuredVideoFromId(
  id: string | null | undefined,
  start = 0,
): FeaturedVideo | null {
  return id
    ? featuredVideoSchema.parse({
        provider: "YOUTUBE",
        video_id: id,
        ...(start ? { start_seconds: start } : {}),
      })
    : null;
}
export function featuredVideoUrl(
  video: FeaturedVideo | null | undefined,
): string | null {
  return video
    ? `https://www.youtube.com/watch?v=${video.video_id}${video.start_seconds ? `&t=${video.start_seconds}` : ""}`
    : null;
}
