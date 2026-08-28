import type { IncomingHttpHeaders } from "node:http";

import { COUNTRY_HEADER, countryCodeFromHeader } from "lib/country";

/**
 * Headers an SSR page must preserve when it calls Manifold's own API.
 *
 * Cookie keeps the internal request in the same authenticated session. Country
 * keeps regional pricing consistent between the server-rendered page and
 * subsequent browser requests.
 */
export function headersForInternalFetch(
  incomingHeaders: IncomingHttpHeaders,
): HeadersInit {
  const forwarded: Record<string, string> = {};

  if (incomingHeaders.cookie) {
    forwarded.cookie = incomingHeaders.cookie;
  }

  const country = countryCodeFromHeader(incomingHeaders[COUNTRY_HEADER]);
  if (country) {
    forwarded[COUNTRY_HEADER] = country;
  }

  return forwarded;
}
