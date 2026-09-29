import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { Compass, Gamepad2, Library, Radio, Search, Store } from "lucide-react";

import { UserMenu } from "components/store/UserMenu";
import { FollowedOutlets } from "components/store/FollowedOutlets";
import { LanguageSwitcher } from "components/LanguageSwitcher";
import { useI18n } from "lib/i18n";

const primaryNavigation = [
  { href: "/store", label: "Discover", icon: Compass },
  { href: "/store#outlets", label: "Outlets", icon: Radio },
  { href: "/library", label: "Library", icon: Library },
] as const;

const creatorNavigation = [
  { href: "/onboarding/create", label: "Publish a game", icon: Gamepad2 },
  { href: "/store/new", label: "Create an Outlet", icon: Store },
] as const;

function Brand() {
  const { t } = useI18n();
  return (
    <Link
      href="/store"
      className="inline-flex items-center gap-3 text-white"
      aria-label={t("Manifold Store")}
    >
      <Image
        src="/images/brand/manifold-logo.png"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 rounded-lg"
        priority
      />
      <span className="text-sm font-black tracking-[0.16em]">MANIFOLD</span>
    </Link>
  );
}

function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Form
      action="/search"
      className={
        compact ? "relative min-w-0 flex-1" : "relative w-full max-w-xl"
      }
    >
      <Search
        size={17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
      />
      <input
        type="search"
        name="q"
        aria-label={t("Search games")}
        placeholder={compact ? t("Search") : t("Search games on Manifold")}
        className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/35 hover:border-white/20 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20"
      />
    </Form>
  );
}

function StoreHomeFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-white/[0.08] bg-[#0b0812] px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/images/brand/manifold-logo.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
          />
          <p className="text-xs font-bold tracking-[0.14em] text-white/55">
            MANIFOLD POWERED
          </p>
        </div>

        <nav
          className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/45"
          aria-label={t("Footer navigation")}
        >
          <Link href="/store" className="hover:text-white">
            {t("Browse games")}
          </Link>
          <Link href="/about" className="hover:text-white">
            {t("About")}
          </Link>
          <a
            href="https://github.com/pedromello/manifoldpowered.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white"
          >
            GitHub
          </a>
          <a
            href="https://x.com/ManifoldPowered"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white"
          >
            X
          </a>
          <a
            href="mailto:pedro@manifoldpowered.com"
            aria-label={t("Email Manifold")}
            className="inline-flex items-center rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-violet-400"
          >
            {t("Get in touch")}
          </a>
        </nav>

        <div className="text-xs leading-5 text-white/25 sm:text-right">
          <p>© 2026 Manifold Powered</p>
          <p>
            {t("Steam is a trademark of Valve Corporation. No affiliation.")}
          </p>
        </div>
      </div>
    </footer>
  );
}

function PreviewAccountControl() {
  const { t } = useI18n();
  return (
    <Link
      href="/login"
      className="inline-flex h-10 items-center rounded-lg border border-white/10 px-3 text-xs font-bold text-white/70"
    >
      {t("Log in")}
    </Link>
  );
}

export function StoreHomeLayout({
  children,
  visitorPreview = false,
}: {
  children: ReactNode;
  visitorPreview?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();

  const isActive = (href: string) => {
    if (href === "/library") return router.pathname.startsWith("/library");
    if (href === "/store") return router.pathname === "/store";
    if (href === "/store#outlets") {
      return (
        router.pathname === "/store/[slug]" ||
        router.asPath.startsWith("/store#outlets")
      );
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-[#0b0812] text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.08] bg-[#0d0a13] lg:flex">
        <div className="flex h-20 items-center px-6">
          <Brand />
        </div>

        <nav
          className="flex flex-1 flex-col px-3 pb-6"
          aria-label={t("Main navigation")}
        >
          <div className="space-y-1">
            {primaryNavigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  isActive(href)
                    ? "bg-white/[0.08] text-white"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} />
                {t(label)}
              </Link>
            ))}
          </div>

          <div className="mt-7 border-t border-white/[0.08] pt-6">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
              {t("For creators")}
            </p>
            <div className="space-y-1">
              {creatorNavigation.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {t(label)}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            {!visitorPreview && <FollowedOutlets />}

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
              <p className="text-sm font-semibold text-white/80">
                {t("New to Manifold?")}
              </p>
              <p className="mt-1 text-xs leading-5 text-white/40">
                {t(
                  "Games live in one catalog. Outlets help you discover them.",
                )}
              </p>
              <Link
                href="/about"
                className="mt-3 inline-flex text-xs font-bold text-violet-300 hover:text-violet-200"
              >
                {t("How it works")}
              </Link>
            </div>
          </div>
        </nav>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0b0812]/95 backdrop-blur-md">
          <div className="hidden h-16 items-center justify-between gap-6 px-6 lg:flex xl:px-10">
            <GlobalSearch />
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              {visitorPreview ? (
                <PreviewAccountControl />
              ) : (
                <UserMenu variant="store-home" />
              )}
            </div>
          </div>

          <div className="flex h-16 items-center gap-4 px-4 lg:hidden">
            <Link
              href="/store"
              aria-label={t("Manifold Store")}
              className="shrink-0"
            >
              <Image
                src="/images/brand/manifold-logo.png"
                alt=""
                width={34}
                height={34}
                className="h-[34px] w-[34px] rounded-lg"
                priority
              />
            </Link>
            <GlobalSearch compact />
            <LanguageSwitcher compact />
            {visitorPreview ? (
              <PreviewAccountControl />
            ) : (
              <UserMenu variant="store-home" />
            )}
          </div>
        </header>

        {children}
        <StoreHomeFooter />
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-white/[0.1] bg-[#0d0a13]/98 px-4 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label={t("Mobile navigation")}
      >
        {primaryNavigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              isActive(href) ? "text-white" : "text-white/45"
            }`}
          >
            <Icon size={19} strokeWidth={1.8} />
            {t(label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
