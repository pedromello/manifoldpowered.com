import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Gamepad2,
  Plus,
  Store,
} from "lucide-react";

import { UserMenu } from "components/store/UserMenu";
import { LanguageSwitcher } from "components/LanguageSwitcher";
import { useI18n } from "lib/i18n";

const links = [
  { href: "/store/mine", label: "My Outlets", icon: Store },
  { href: "/studio", label: "My Studios", icon: Building2 },
  {
    href: "/studio/ownership-claims",
    label: "Ownership claims",
    icon: BadgeCheck,
  },
  { href: "/store/new", label: "Create Outlet", icon: Plus },
  { href: "/onboarding/create", label: "Create Studio", icon: Gamepad2 },
] as const;

export function CreatorWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();

  const isActive = (href: string) => {
    if (href === "/studio") {
      return (
        router.pathname.startsWith("/studio") &&
        !router.pathname.startsWith("/studio/ownership-claims")
      );
    }
    if (href === "/store/mine") {
      return (
        router.pathname === href ||
        (router.pathname.startsWith("/store/") &&
          router.pathname !== "/store/new")
      );
    }
    return router.pathname === href;
  };

  return (
    <div className="min-h-screen bg-[#0b0812] text-white lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.08] bg-[#0d0a13] lg:flex">
        <Link href="/store" className="flex h-20 items-center gap-3 px-6">
          <Image
            src="/images/brand/manifold-logo.png"
            alt=""
            width={34}
            height={34}
            className="h-[34px] w-[34px] rounded-lg"
          />
          <div>
            <p className="text-xs font-black tracking-[0.14em]">MANIFOLD</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-300">
              {t("Creator workspace")}
            </p>
          </div>
        </Link>

        <nav
          className="flex flex-1 flex-col gap-1 px-3 pb-5"
          aria-label={t("Creator workspace navigation")}
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
                isActive(href)
                  ? "bg-white/[0.09] text-white"
                  : "text-white/50 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {t(label)}
            </Link>
          ))}

          <div className="mt-auto border-t border-white/[0.08] pt-4">
            <Link
              href="/store"
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-white/45 hover:bg-white/[0.05] hover:text-white"
            >
              <ArrowLeft size={17} /> {t("Back to Store")}
            </Link>
          </div>
        </nav>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0b0812]/95 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/store" className="flex items-center gap-2 lg:hidden">
            <Image
              src="/images/brand/manifold-logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-xs font-black uppercase tracking-[0.12em]">
              {t("Creator")}
            </span>
          </Link>
          <p className="hidden text-sm font-semibold text-white/45 lg:block">
            {t("Manage what you publish and curate")}
          </p>
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            <UserMenu variant="store-home" />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.06] px-3 py-2 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${
                isActive(href) ? "bg-white/[0.09]" : "text-white/50"
              }`}
            >
              <Icon size={15} /> {t(label)}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
    </div>
  );
}
