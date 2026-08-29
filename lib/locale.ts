import { countryCodeFromHeader } from "./country";

export const locales = ["en", "pt-BR"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
};

export function isAppLocale(value: string | undefined): value is AppLocale {
  return locales.some((locale) => locale === value);
}

export function appLocaleFromQuery(
  value: string | string[] | undefined,
): AppLocale {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isAppLocale(candidate) ? candidate : defaultLocale;
}

export function localeForCountry(
  countryHeader: string | string[] | null | undefined,
): AppLocale {
  return countryCodeFromHeader(countryHeader) === "BR" ? "pt-BR" : "en";
}
