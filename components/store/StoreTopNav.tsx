import Link from "next/link";
import Image from "next/image";
import { useState, useMemo } from "react";
import { type Game } from "lib/games";
import { DiscountBadge } from "./DiscountBadge";

export function StoreTopNav({ games }: { games: Game[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return games
      .filter((g) => g.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [searchQuery, games]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#1D0F3B]/80 backdrop-blur-xl border-b border-white/5 py-3 px-6 md:px-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 w-full">
        <div className="flex-shrink-0">
          <Link
            href="/store"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <Image
              src="/images/brand/manifold-logo.png"
              alt="Manifold Logo"
              width={120}
              height={120}
              className="w-auto h-7 md:h-10 drop-shadow-md"
            />
          </Link>
        </div>

        <div className="relative flex-1 max-w-sm flex justify-end">
          <div
            className={`relative w-full transition-all duration-300 ease-out ${
              isFocused ? "max-w-full" : "max-w-[160px] md:max-w-[240px]"
            }`}
          >
            <input
              type="text"
              placeholder="Search store..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-3 text-sm md:text-base font-bold text-white placeholder:text-white/30 outline-none transition-all duration-300 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)] focus:border-white/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            />

            {isFocused && searchQuery && (
              <div className="flex flex-col gap-2 absolute top-full mt-3 right-0 w-[calc(100vw-3rem)] max-w-md bg-[#130b25] backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-4 duration-200">
                {filteredGames.length > 0 ? (
                  filteredGames.map((game) => (
                    <Link
                      key={game.id}
                      href={`/item/${game.id}`}
                      className="flex items-center gap-4 px-4 py-0 transition-colors hover:bg-white/5"
                    >
                      <div
                        className="h-14 md:h-20 aspect-[920/430] rounded-xl shrink-0 border border-white/5"
                        style={{ background: game.gradient }}
                      />
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white md:text-lg truncate">
                            {game.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <p
                            className="text-sm font-semibold md:text-xl"
                            style={{
                              color: game.discountLabel
                                ? "#FFB400"
                                : "rgba(255, 255, 255, 0.4)",
                            }}
                          >
                            ${game.currentPrice}
                          </p>
                          <p className="text-sm font-semibold line-through text-white/40">
                            ${game.originalPrice}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end pr-4">
                        {game.discountLabel && (
                          <DiscountBadge
                            label={game.discountLabel}
                            size="small"
                          />
                        )}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-6 py-8 text-center text-white/40 font-semibold">
                    No games found matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
