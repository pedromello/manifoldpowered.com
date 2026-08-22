import Link from "next/link";
import useSWR from "swr";
import {
  User,
  LogOut,
  Library,
  Building2,
  Store,
  Loader2,
  Shield,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";

export function UserMenu({
  variant = "default",
}: {
  variant?: "default" | "store-home";
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    data: user,
    error,
    isLoading,
    mutate,
  } = useSWR(
    "/api/v1/user",
    (url) =>
      fetch(url).then(async (res) => {
        if (!res.ok) {
          throw new Error("Not logged in");
        }
        return res.json();
      }),
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/v1/sessions", { method: "DELETE" });
    await mutate();
    router.push("/store");
    setIsOpen(false);
  };

  const isLoggedOut = !!error;
  const isStoreHome = variant === "store-home";

  if (isLoading) {
    return (
      <div
        className={`flex h-10 w-10 animate-pulse items-center justify-center border border-white/10 bg-white/5 text-white/50 ${isStoreHome ? "rounded-lg" : "rounded-full"}`}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (isLoggedOut) {
    return (
      <Link
        href="/login"
        className={
          isStoreHome
            ? "flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            : "flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black transition-colors hover:bg-white/90"
        }
      >
        <User size={16} />
        <span className="hidden sm:inline">Log in</span>
      </Link>
    );
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors"
        aria-label="User menu"
      >
        <span className="font-black text-sm uppercase">
          {user?.username?.charAt(0) || <User size={16} />}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-3 w-56 bg-[#130b25] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div className="px-4 py-3 border-b border-white/5 mb-2">
            <p className="text-sm font-black text-white truncate">
              {user?.username}
            </p>
          </div>

          <div className="flex flex-col">
            <Link
              href="/library"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Library size={16} className="text-indigo-400" />
              My Library
            </Link>

            <Link
              href="/studio"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Building2 size={16} className="text-indigo-400" />
              My Studios
            </Link>

            <Link
              href="/store/mine"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Store size={16} className="text-indigo-400" />
              My Outlets
            </Link>

            {user?.username === "pedromello" && (
              <Link
                href="/backoffice"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Shield size={16} className="text-indigo-400" />
                Backoffice
              </Link>
            )}

            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-white/80 hover:text-rose-400 hover:bg-rose-500/10 transition-colors w-full text-left"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
