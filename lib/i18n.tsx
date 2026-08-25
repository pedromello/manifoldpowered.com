import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useRouter } from "next/router";
import { ptBR } from "lib/i18n/pt-BR";

export const locales = ["en", "pt-BR"] as const;
export type AppLocale = (typeof locales)[number];

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
};

type TranslationValues = Record<string, string | number>;

function interpolate(message: string, values?: TranslationValues) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );
}

type I18nContextValue = {
  locale: AppLocale;
  t: (message: string, values?: TranslationValues) => string;
  translateError: (
    message: string | null | undefined,
    fallback: string,
  ) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  t: (message, values) => interpolate(message, values),
  translateError: (message, fallback) => message || fallback,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale: AppLocale = router.locale === "pt-BR" ? "pt-BR" : "en";

  const t = useCallback(
    (message: string, values?: TranslationValues) => {
      const translated =
        locale === "pt-BR" ? (ptBR[message] ?? message) : message;
      return interpolate(translated, values);
    },
    [locale],
  );

  const translateError = useCallback(
    (message: string | null | undefined, fallback: string) => {
      if (locale === "en") return message || fallback;
      return ptBR[message || ""] ?? ptBR[fallback] ?? fallback;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, t, translateError }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function hasPortugueseTranslation(message: string) {
  return Object.prototype.hasOwnProperty.call(ptBR, message);
}

export const portugueseMessages = ptBR;
