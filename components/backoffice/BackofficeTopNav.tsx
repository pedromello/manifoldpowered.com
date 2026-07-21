import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  Gamepad2,
  Users,
  Building2,
  Store as StoreIcon,
  LogOut,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard },
  { href: "/backoffice/games", label: "Games", icon: Gamepad2 },
  { href: "/backoffice/users", label: "Users", icon: Users },
  { href: "/backoffice/studios", label: "Studios", icon: Building2 },
  { href: "/backoffice/stores", label: "Stores", icon: StoreIcon },
];

export function BackofficeTopNav({ username }: { username: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/v1/sessions", { method: "DELETE" });
    router.push("/store");
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#130b25]/90 backdrop-blur-xl border-b border-white/10 py-3 px-4 md:px-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link
            href="/backoffice"
            className="flex items-center gap-2 font-black text-lg tracking-tight text-white shrink-0"
          >
            <ShieldCheck size={20} className="text-indigo-400" />
            <span className="hidden sm:inline">Manifold Admin</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                router.pathname === href ||
                (href !== "/backoffice" && router.pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold tracking-wide transition-all ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/store"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Store
          </Link>
          <span className="hidden lg:inline text-sm font-bold text-white/70">
            {username}
          </span>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-white/60 hover:text-rose-400 hover:bg-rose-500/10 text-sm font-bold transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
