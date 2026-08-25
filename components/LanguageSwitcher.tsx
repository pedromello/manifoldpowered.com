import { Languages } from "lucide-react";
import { useRouter } from "next/router";

import { localeNames, type AppLocale, useI18n } from "lib/i18n";
import { LOCALE_COOKIE } from "lib/locale";

export function LanguageSwitcher({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();

  async function changeLocale(nextLocale: AppLocale) {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    await router.push(router.asPath, router.asPath, { locale: nextLocale });
  }

  if (compact) {
    const nextLocale: AppLocale = locale === "en" ? "pt-BR" : "en";
    return (
      <button
        type="button"
        onClick={() => changeLocale(nextLocale)}
        aria-label={`${t("Select language")}: ${localeNames[nextLocale]}`}
        title={localeNames[nextLocale]}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/65 transition-colors hover:border-white/20 hover:text-white ${className}`}
      >
        <Languages size={17} aria-hidden="true" />
      </button>
    );
  }

  return (
    <label
      className={`relative inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white/65 transition-colors hover:border-white/20 hover:text-white ${className}`}
    >
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t("Select language")}</span>
      <select
        aria-label={t("Select language")}
        value={locale}
        onChange={(event) => changeLocale(event.target.value as AppLocale)}
        className="cursor-pointer appearance-none bg-transparent pr-2 text-xs font-bold uppercase tracking-wide text-inherit outline-none"
      >
        <option value="en" className="bg-[#14101c] text-white">
          {localeNames.en}
        </option>
        <option value="pt-BR" className="bg-[#14101c] text-white">
          {localeNames["pt-BR"]}
        </option>
      </select>
    </label>
  );
}
