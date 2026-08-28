import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { LanguageSwitcher } from "components/LanguageSwitcher";
import { useI18n } from "lib/i18n";

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

const benefits = [
  "One library across every Manifold Outlet",
  "Passwordless sign-in with a six-digit code",
  "Purchases and downloads stay with your account",
] as const;

export default function AuthLayout({
  title,
  description = "Join Manifold",
  children,
}: AuthLayoutProps) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-[#0b0812] text-white">
      <Head>
        <title>{title}</title>
        <meta name="description" content={t(description)} />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#0b0812" />
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>

      <header className="border-b border-white/[0.08]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/store"
            className="inline-flex items-center gap-3"
            aria-label={t("Manifold Store")}
          >
            <Image
              src="/images/brand/manifold-logo.png"
              alt=""
              width={34}
              height={34}
              className="h-[34px] w-[34px] rounded-lg"
              priority
            />
            <span className="text-sm font-black tracking-[0.16em]">
              MANIFOLD
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            <Link
              href="/store"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition-colors hover:text-white"
            >
              <ArrowLeft size={16} />
              {t("Back to Store")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-20 lg:py-16">
        <section className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
            {t("Your Manifold account")}
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">
            {t("Your games follow you, not the storefront.")}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/50">
            {t(
              "Discover a game through any creator-run Outlet and keep it in the same personal library.",
            )}
          </p>

          <ul className="mt-8 space-y-4">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-center gap-3 text-sm font-semibold text-white/65"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-400/20 bg-violet-400/[0.08] text-violet-300">
                  <Check size={14} />
                </span>
                {t(benefit)}
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rounded-xl border border-white/[0.1] bg-[#14101c] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.25)] sm:p-8"
          aria-live="polite"
        >
          {children}
        </section>
      </main>

      <style jsx global>{`
        html,
        body {
          background-color: #0b0812 !important;
        }
      `}</style>
    </div>
  );
}
