import type { AppLocale } from "lib/locale";

export function withLocale(url: string, locale: AppLocale): string {
  const parsed = new URL(url, "http://manifold.local");
  parsed.searchParams.set("locale", locale);
  return `${parsed.pathname}${parsed.search}`;
}
