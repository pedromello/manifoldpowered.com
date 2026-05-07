import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { Store, Library, Search } from "lucide-react";
import { DiscountBadge } from "./DiscountBadge";
import { UserMenu } from "./UserMenu";
import { type GameApi } from "components/store/GameListItem";

export function StoreTopNav() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  const { data, isLoading } = useSWR<{ games: GameApi[] }>(
    searchQuery.trim()
      ? `/api/v1/games?q=${encodeURIComponent(searchQuery)}&limit=5`
      : null,
    (url) => fetch(url).then((res) => res.json()),
  );

  const filteredGames = data?.games || [];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      setIsFocused(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#1D0F3B]/80 backdrop-blur-xl border-b border-white/5 py-3 px-4 md:px-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-6">
          <Link
            href="/store"
            className="flex items-center transition-opacity hover:opacity-80 shrink-0"
          >
            <Image
              src="/images/brand/manifold-logo.png"
              alt="Manifold Logo"
              width={120}
              height={120}
              className="w-auto h-7 md:h-10 drop-shadow-md"
            />
          </Link>

          <nav className="hidden lg:flex items-center gap-2">
            <Link
              href="/store"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-bold text-sm tracking-wide"
            >
              <Store size={18} />
              Store
            </Link>
            <Link
              href="/library"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-bold text-sm tracking-wide"
            >
              <Library size={18} />
              Library
            </Link>
          </nav>
        </div>

        <div className="relative flex-1 max-w-lg flex justify-end items-center gap-4">
          <div
            className={`relative w-full transition-all duration-300 ease-out ${
              isFocused ? "max-w-full" : "max-w-[160px] md:max-w-[280px]"
            }`}
          >
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/30">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search store..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl pl-11 pr-5 py-2 md:py-3 text-sm md:text-base font-bold text-white placeholder:text-white/30 outline-none transition-all duration-300 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)] focus:border-white/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            />

            {isFocused && searchQuery && (
              <div className="flex flex-col gap-2 absolute top-full mt-3 right-0 w-[calc(100vw-2rem)] md:w-full max-w-md bg-[#130b25] backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-4 duration-200">
                {isLoading ? (
                  <div className="px-6 py-8 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/20"></div>
                  </div>
                ) : filteredGames.length > 0 ? (
                  <>
                    {filteredGames.map((game) => {
                      const isDemo = !game.price || Number(game.price) === 0;
                      return (
                        <Link
                          key={game.id}
                          href={`/item/${game.slug}`}
                          className="flex items-center gap-4 px-4 py-2 transition-colors hover:bg-white/5"
                        >
                          <div
                            className="h-12 md:h-16 aspect-[16/9] rounded-lg shrink-0 border border-white/5"
                            style={{
                              background: game.media.banner
                                ? `url(${game.media.banner}) center/cover no-repeat`
                                : defaultGradient,
                            }}
                          />
                          <div className="flex-1 overflow-hidden">
                            <h4 className="font-bold text-white text-sm md:text-base truncate">
                              {game.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p
                                className="text-xs font-black md:text-sm uppercase"
                                style={{
                                  color:
                                    isDemo || game.discount_label
                                      ? "#FFB400"
                                      : "rgba(255, 255, 255, 0.4)",
                                }}
                              >
                                {isDemo ? "Free" : `$${game.price}`}
                              </p>
                              {!isDemo && game.base_price && (
                                <p className="text-xs font-semibold line-through text-white/40">
                                  ${game.base_price}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-end">
                            {!isDemo && game.discount_label && (
                              <DiscountBadge
                                label={game.discount_label}
                                size="small"
                              />
                            )}
                          </div>
                        </Link>
                      );
                    })}
                    <div className="px-4 py-2 mt-1 border-t border-white/5">
                      <Link
                        href={`/search?q=${encodeURIComponent(searchQuery)}`}
                        className="block w-full py-2 text-center rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                      >
                        View all results
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="px-6 py-8 text-center text-white/40 font-semibold text-sm">
                    No games found matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            )}
          </div>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
