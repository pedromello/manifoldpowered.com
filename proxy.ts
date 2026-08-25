import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { COUNTRY_HEADER } from "lib/country";
import {
  defaultLocale,
  isAppLocale,
  LOCALE_COOKIE,
  localeForCountry,
  locales,
} from "lib/locale";

function hasLocalePrefix(pathname: string) {
  return locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
}

function isPageRoute(pathname: string) {
  return (
    pathname !== "/api" &&
    !pathname.startsWith("/api/") &&
    pathname !== "/_next" &&
    !pathname.startsWith("/_next/") &&
    pathname !== "/favicon.ico" &&
    pathname !== "/site.webmanifest" &&
    !/\/[^/]+\.[^/]+$/.test(pathname)
  );
}

function preferredLocale(request: NextRequest) {
  const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value;

  if (isAppLocale(savedLocale)) {
    return savedLocale;
  }

  return localeForCountry(request.headers.get(COUNTRY_HEADER));
}

export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  // A locale in the URL is an explicit choice and must never be overridden by
  // geolocation or a stale cookie.
  const pathname = new URL(request.url).pathname;
  if (!isPageRoute(pathname) || hasLocalePrefix(pathname)) {
    return NextResponse.next();
  }

  const locale = preferredLocale(request);
  if (locale === defaultLocale) {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.pathname = `/${locale}${pathname}`;

  return NextResponse.redirect(destination);
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|site.webmanifest|.*\\..*).*)",
      locale: false,
    },
  ],
};
