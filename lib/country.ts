// Vercel sets this on requests served through its network. Currency and
// language detection deliberately share this source so they cannot disagree
// about whether a visitor is in Brazil.
export const COUNTRY_HEADER = "x-vercel-ip-country";
// Preserves the visitor country across an SSR page's second request through
// Vercel. It is intentionally used only for non-transactional external offers.
export const SSR_COUNTRY_HEADER = "x-manifold-visitor-country";

type CountryHeaderValue = string | string[] | null | undefined;

export function countryCodeFromHeader(
  value: CountryHeaderValue,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate) {
    return null;
  }

  const normalized = candidate.trim().toUpperCase();

  // Vercel sends "XX" when it cannot geolocate the request.
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === "XX") {
    return null;
  }

  return normalized;
}
