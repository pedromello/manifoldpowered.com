const STEAM_APP_ID_REGEX = /^\d+$/;
const STEAM_STORE_URL_REGEX = /store\.steampowered\.com\/app\/(\d+)/i;
const HEADER_CHECK_TIMEOUT_MS = 4000;

/**
 * Steam's app details API returns the 460x215 `header.jpg`. The same artwork
 * is also published at `header_2x.jpg` (920x430), which is suitable for the
 * larger storefront hero without changing its aspect ratio.
 */
export function highResolutionSteamHeaderImage(
  url?: string,
): string | undefined {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const isSteamCdn =
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".steamstatic.com");
    const isStandardHeader = /\/header\.jpg$/i.test(parsed.pathname);

    if (!isSteamCdn || !isStandardHeader) return url;

    parsed.pathname = parsed.pathname.replace(/header\.jpg$/i, "header_2x.jpg");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Prefer Steam's 2x header only when its CDN confirms that it exists. Some
 * older Steam apps publish `header.jpg` without a matching `header_2x.jpg`.
 * A failed check must never prevent a game from being imported, so the
 * original API-provided header remains the safe fallback.
 */
export async function resolveSteamHeaderImage(
  url?: string,
): Promise<string | undefined> {
  const highResolutionUrl = highResolutionSteamHeaderImage(url);

  if (!url || highResolutionUrl === url) return url;

  try {
    const response = await fetch(highResolutionUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(HEADER_CHECK_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type");

    return response.ok && contentType?.startsWith("image/")
      ? highResolutionUrl
      : url;
  } catch {
    return url;
  }
}

export function extractSteamAppId(input: string): string | null {
  const trimmed = input.trim();

  if (STEAM_APP_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(STEAM_STORE_URL_REGEX);
  return match ? match[1] : null;
}
