import Head from "next/head";
import Link from "next/link";
import NextErrorComponent, { type ErrorProps } from "next/error";

import { LanguageSwitcher } from "components/LanguageSwitcher";
import { useI18n } from "lib/i18n";

export default function ErrorPage({ statusCode }: ErrorProps) {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0711] px-6 text-white">
      <Head>
        <title>{t("Something went wrong | Manifold")}</title>
      </Head>
      <div className="absolute right-5 top-5">
        <LanguageSwitcher />
      </div>
      <section className="max-w-lg text-center">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-300">
          {statusCode || t("Error")}
        </p>
        <h1 className="mt-4 text-4xl font-black md:text-6xl">
          {t("Something went wrong")}
        </h1>
        <p className="mt-5 text-base leading-7 text-white/55">
          {t("We could not load this page. Please try again in a moment.")}
        </p>
        <Link
          href="/store"
          className="mt-8 inline-flex rounded-xl bg-violet-500 px-6 py-3 text-sm font-black transition-colors hover:bg-violet-400"
        >
          {t("Back to Store")}
        </Link>
      </section>
    </main>
  );
}

ErrorPage.getInitialProps = NextErrorComponent.getInitialProps;
