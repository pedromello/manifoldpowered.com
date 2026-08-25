import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";

import nextConfig from "../../next.config";
import { config, proxy } from "../../proxy";

function request(
  path: string,
  { country, cookie }: { country?: string; cookie?: string } = {},
) {
  const headers = new Headers();
  if (country) headers.set("x-vercel-ip-country", country);
  if (cookie) headers.set("cookie", cookie);

  return new NextRequest(`https://manifoldpowered.com${path}`, { headers });
}

describe("country-aware language proxy", () => {
  test("redirects a Brazilian visitor to the equivalent pt-BR route", () => {
    const response = proxy(request("/store?tab=featured", { country: "BR" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(
      "https://manifoldpowered.com/pt-BR/store?tab=featured",
    );
  });

  test("keeps the default English route outside Brazil", () => {
    const response = proxy(request("/store", { country: "US" }));

    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
  });

  test("manual English selection overrides Brazilian geolocation", () => {
    const response = proxy(
      request("/store", { country: "BR", cookie: "NEXT_LOCALE=en" }),
    );

    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
  });

  test("manual Portuguese selection overrides non-Brazilian geolocation", () => {
    const response = proxy(
      request("/library", {
        country: "US",
        cookie: "NEXT_LOCALE=pt-BR",
      }),
    );

    expect(getRedirectUrl(response)).toBe(
      "https://manifoldpowered.com/pt-BR/library",
    );
  });

  test("does not redirect a route that already has an explicit locale", () => {
    const response = proxy(request("/pt-BR/store", { country: "US" }));

    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
  });

  test("does not redirect Next.js data requests for localized pages", () => {
    const response = proxy(
      request("/_next/data/build-id/pt-BR/store.json", { country: "BR" }),
    );

    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
  });

  test.each(["/api/v1/games", "/_next/static/chunk.js", "/images/logo.png"])(
    "never redirects non-page route %s, even for Brazil",
    (url) => {
      const response = proxy(request(url, { country: "BR" }));

      expect(response.status).toBe(200);
      expect(getRedirectUrl(response)).toBeNull();
    },
  );

  test.each(["/api/v1/games", "/_next/static/chunk.js", "/images/logo.png"])(
    "does not run for %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(
        false,
      );
    },
  );
});
