// These are catalog media origins, never generic social/merchant links.
export const CATALOG_IMAGE_ORIGINS = [
  "https://assets.nintendo.com",
  "https://images.unsplash.com",
  "https://shared.fastly.steamstatic.com",
  "https://shared.akamai.steamstatic.com",
  "https://cdn.akamai.steamstatic.com",
  "https://cdn.cloudflare.steamstatic.com",
];
export const CATALOG_VIDEO_ORIGINS = [
  "https://cdn.akamai.steamstatic.com",
  "https://cdn.cloudflare.steamstatic.com",
  "https://video.akamai.steamstatic.com",
  "https://video.fastly.steamstatic.com",
  "https://video.steamstatic.com",
  "https://video.steamusercontent.com",
];

function allowedUrl(value: unknown, origins: string[]) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !origins.includes(url.origin)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function projectCatalogMedia(input: unknown) {
  const media =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const storedScreenshots: unknown[] = Array.isArray(media.screenshots)
    ? media.screenshots
    : [];
  const cover = allowedUrl(media.banner, CATALOG_IMAGE_ORIGINS)?.href ?? null;
  const screenshots = [
    ...new Set(
      storedScreenshots
        .map((value) => allowedUrl(value, CATALOG_IMAGE_ORIGINS)?.href)
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 6);
  const images = [
    ...new Set(
      [cover, ...screenshots]
        .map((value) => allowedUrl(value, CATALOG_IMAGE_ORIGINS)?.href)
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 6);
  const storedVideos: unknown[] = Array.isArray(media.videos)
    ? media.videos
    : [];
  const videos = storedVideos
    .flatMap<{ url: string; kind: "file" | "external" }>((value) => {
      const file = allowedUrl(value, CATALOG_VIDEO_ORIGINS);
      if (file && /\.(mp4|webm|m3u8)$/i.test(file.pathname)) {
        return [{ url: file.href, kind: "file" as const }];
      }
      const external = allowedUrl(value, [
        "https://www.youtube.com",
        "https://youtube.com",
        "https://youtu.be",
      ]);
      if (!external) return [];
      const id =
        external.hostname === "youtu.be"
          ? external.pathname.slice(1)
          : external.pathname === "/watch"
            ? external.searchParams.get("v")
            : external.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1];
      if (!id || !/^[\w-]{11}$/.test(id)) return [];
      // Restrict navigation to the stored video, dropping tracking/other params.
      return [
        {
          url: `https://www.youtube.com/watch?v=${id}`,
          kind: "external" as const,
        },
      ];
    })
    .slice(0, 2);
  return { images, videos, cover, screenshots };
}
