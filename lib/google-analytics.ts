// GA4 measurement IDs are public identifiers, not credentials.
export const GOOGLE_ANALYTICS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ?? "G-VTZ55HBZVP";

export function isAnalyticsHost(hostname: string): boolean {
  return ["manifoldpowered.com", "www.manifoldpowered.com"].includes(hostname);
}

export function isAnalyticsEnabled(
  hostname: string,
  environment: string,
  measurementId: string | undefined,
): boolean {
  return (
    environment === "production" &&
    /^G-[A-Z0-9]+$/.test(measurementId ?? "") &&
    isAnalyticsHost(hostname)
  );
}

export function isPrivateAnalyticsRoute(route: string): boolean {
  return (
    route.includes("[") &&
    ![
      "/store/[slug]",
      "/store/[slug]/selections/[selectionSlug]",
      "/item/[slug]",
    ].includes(route)
  );
}

/** Keep query strings, fragments and private route identifiers out of GA4. */
export function analyticsPageLocation(asPath: string, route: string): string {
  const url = new URL(asPath, "https://www.manifoldpowered.com");

  if (isPrivateAnalyticsRoute(route)) {
    const localePrefix = url.pathname.startsWith("/pt-BR/") ? "/pt-BR" : "";
    url.pathname = `${localePrefix}${route}`;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export function analyticsReferrer(referrer: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    // Internal referrers may contain activation tokens or private identifiers.
    return `${url.origin}/`;
  } catch {
    return "";
  }
}
