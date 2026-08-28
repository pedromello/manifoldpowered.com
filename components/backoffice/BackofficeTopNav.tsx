import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  Building2,
  Coins,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { LanguageSwitcher } from "components/LanguageSwitcher";
import { useI18n } from "lib/i18n";

const NAV_ITEMS = [
  { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard },
  { href: "/backoffice/revenue", label: "Revenue", icon: Banknote },
  { href: "/backoffice/games", label: "Games", icon: Gamepad2 },
  { href: "/backoffice/users", label: "Users", icon: Users },
  { href: "/backoffice/studios", label: "Studios", icon: Building2 },
  { href: "/backoffice/stores", label: "Outlets", icon: Store },
  { href: "/backoffice/currencies", label: "Currencies", icon: Coins },
  { href: "/backoffice/exchange-rates", label: "Rates", icon: ArrowLeftRight },
] as const;

export function BackofficeTopNav({ username }: { username: string }) {
  const router = useRouter();
  const { t } = useI18n();

  async function handleSignOut() {
    await fetch("/api/v1/sessions", { method: "DELETE" });
    router.push("/store");
  }

  function isActive(href: string) {
    return (
      router.pathname === href ||
      (href !== "/backoffice" && router.pathname.startsWith(href))
    );
  }

  const links = NAV_ITEMS.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={`flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
        isActive(href)
          ? "bg-white/[0.09] text-white"
          : "text-white/50 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <Icon size={17} strokeWidth={1.8} />
      {t(label)}
    </Link>
  ));

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.08] bg-[#0d0a13] lg:flex">
        <Link href="/backoffice" className="flex h-20 items-center gap-3 px-6">
          <Image
            src="/images/brand/manifold-logo.png"
            alt=""
            width={34}
            height={34}
            className="h-[34px] w-[34px] rounded-lg"
          />
          <div>
            <p className="text-xs font-black tracking-[0.14em]">MANIFOLD</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-300">
              <ShieldCheck size={11} /> {t("Admin")}
            </p>
          </div>
        </Link>

        <nav
          className="flex flex-1 flex-col gap-1 px-3 pb-5"
          aria-label={t("Backoffice navigation")}
        >
          {links}

          <div className="mt-auto border-t border-white/[0.08] pt-4">
            <div className="mb-3 px-3">
              <LanguageSwitcher />
            </div>
            <p className="truncate px-3 text-xs font-semibold text-white/45">
              {username}
            </p>
            <Link
              href="/store"
              className="mt-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-white/45 hover:bg-white/[0.05] hover:text-white"
            >
              <ArrowLeft size={16} /> {t("Back to Store")}
            </Link>
            <button
              onClick={handleSignOut}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-white/45 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut size={16} /> {t("Sign out")}
            </button>
          </div>
        </nav>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.08] bg-[#0b0812]/95 lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            href="/backoffice"
            className="flex items-center gap-2 font-bold"
          >
            <ShieldCheck size={19} className="text-violet-300" />
            Manifold {t("Admin")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <button
              onClick={handleSignOut}
              aria-label={t("Sign out")}
              className="rounded-lg border border-white/10 p-2 text-white/55"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.06] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links}
        </nav>
      </header>
    </>
  );
}
