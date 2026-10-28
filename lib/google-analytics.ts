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

export function isPrivateAnalyticsRoute(
  route: string,
  asPath?: string,
): boolean {
  if (
    asPath &&
    new URL(asPath, "https://www.manifoldpowered.com").searchParams.has(
      "preview",
    )
  ) {
    return true;
  }
  return (
    route.includes("[") &&
    ![
      "/store/[slug]",
      "/store/[slug]/selections/[selectionSlug]",
      "/item/[slug]",
    ].includes(route)
  );
}

const CAMPAIGN_PARAMETERS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
  "utm_source_platform",
] as const;

/** Keep public campaign labels, but redact other queries and private routes. */
export function analyticsPageLocation(asPath: string, route: string): string {
  const url = new URL(asPath, "https://www.manifoldpowered.com");
  const campaign = new URLSearchParams();

  if (isPrivateAnalyticsRoute(route, asPath)) {
    const localePrefix = url.pathname.startsWith("/pt-BR/") ? "/pt-BR" : "";
    url.pathname = `${localePrefix}${route}`;
  } else {
    for (const parameter of CAMPAIGN_PARAMETERS) {
      const value = url.searchParams.get(parameter);
      if (value) campaign.set(parameter, value);
    }
  }

  url.search = campaign.toString();
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
