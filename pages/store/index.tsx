import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useState, useMemo, useEffect, useCallback } from "react";
import { type Game, mockGames, CATEGORIES } from "lib/games";

// --- Components ---

function SectionDivider() {
  return (
    <div className="w-full flex justify-center py-2">
      <div
        className="w-full max-w-7xl h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--color-indigo-light), transparent)",
        }}
      />
    </div>
  );
}

const colorbadgegreen = "#00FFC2";
const colorbadgeorange = "#FFB400";
const colorbadgered = "#ff5f40";

function DiscountBadge({
  label,
  color = colorbadgered,
}: {
  label: string;
  color?: string;
}) {
  return (
    <span
      className="px-3 py-1 rounded-lg text-xs font-black text-white uppercase tracking-wider shadow-lg transform rotate-2"
      style={{ backgroundColor: color }}
    >
      {label} OFF
    </span>
  );
}

function StoreTopNav({ games }: { games: Game[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return games
      .filter((g) => g.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [searchQuery, games]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 py-4 px-6 md:px-10 pointer-events-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between w-full pointer-events-auto">
        <div className="flex-1">
          <Link
            href="/"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <Image
              src="/images/brand/manifold-logo.png"
              alt="Manifold Logo"
              width={120}
              height={120}
              className="w-auto h-8 md:h-10 drop-shadow-md"
            />
          </Link>
        </div>

        <div className="relative w-full max-w-sm flex justify-end">
          <div
            className={`relative w-full transition-all duration-300 ease-out ${isFocused ? "max-w-full" : "max-w-[200px] md:max-w-[240px]"}`}
          >
            <input
              type="text"
              placeholder="Search store..."
              className="w-full rounded-2xl border border-[var(--color-indigo-light)] bg-white/60 backdrop-blur-md px-5 py-2.5 text-sm font-bold text-[var(--color-purple-dark)] placeholder:text-[rgba(53,34,89,0.5)] outline-none transition-all duration-300 focus:bg-white/90 focus:shadow-lg focus:border-[var(--color-purple-dark)]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            />

            {isFocused && searchQuery && (
              <div className="absolute top-[calc(100%+0.75rem)] right-0 w-[calc(100vw-3rem)] max-w-sm bg-white/85 backdrop-blur-2xl border border-[var(--color-indigo-light)] rounded-3xl shadow-xl overflow-hidden py-3 animate-in fade-in slide-in-from-top-4 duration-200">
                {filteredGames.length > 0 ? (
                  filteredGames.map((game) => (
                    <Link
                      key={game.id}
                      href={`#game-${game.id}`}
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--color-indigo-lighter)]"
                    >
                      <div
                        className="w-12 h-12 rounded-xl shrink-0 border border-[rgba(53,34,89,0.1)]"
                        style={{ background: game.gradient }}
                      />
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[var(--color-purple-dark)] truncate">
                            {game.title}
                          </h4>
                          {game.discountLabel && (
                            <span className="text-[9px] font-black text-[#FFB400]">
                              {game.discountLabel} OFF
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <p
                            className="font-bold"
                            style={{
                              color: game.discountLabel
                                ? colorbadgered
                                : "var(--color-purple-dark)",
                            }}
                          >
                            ${game.currentPrice}
                          </p>
                          {game.originalPrice && (
                            <p className="opacity-40 line-through">
                              ${game.originalPrice}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-6 py-8 text-center opacity-70 font-semibold">
                    No games found matching "{searchQuery}"
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

function HeroBento({ featured }: { featured: Game[] }) {
  if (featured.length < 3) return null;
  const [main, side1, side2] = featured;

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-7xl mx-auto auto-rows-[250px] md:auto-rows-[300px]">
      {/* Main Massive Tile */}
      <div
        className="md:col-span-2 md:row-span-2 rounded-[2rem] border border-[var(--color-indigo-light)] overflow-hidden relative group cursor-pointer shadow-lg"
        style={{ background: main.gradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-purple-dark)] via-transparent to-transparent opacity-90 transition-opacity group-hover:opacity-100" />

        {main.discountLabel && (
          <div className="absolute top-8 right-8 z-10 scale-150 origin-top-right">
            <DiscountBadge label={main.discountLabel} />
          </div>
        )}

        <div className="absolute inset-x-6 bottom-6 md:inset-x-10 md:bottom-10 text-[var(--bg-primary)] flex flex-col items-start">
          <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 text-white">
            Featured Match
          </span>
          <h2 className="text-5xl md:text-[5rem] font-black leading-none mb-2 tracking-tight transform group-hover:scale-105 transition-transform duration-500 origin-bottom-left text-white drop-shadow-md">
            {main.title}
          </h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex flex-col">
              {main.originalPrice && (
                <span className="text-lg opacity-60 line-through font-bold">
                  ${main.originalPrice}
                </span>
              )}
              <span
                className="text-3xl font-black bg-white px-4 py-1.5 rounded-xl shadow-xl"
                style={{
                  color: main.discountLabel
                    ? colorbadgered
                    : "var(--color-purple-dark)",
                }}
              >
                ${main.currentPrice}
              </span>
            </div>
            <div className="flex gap-2 self-end mb-1">
              {main.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-xl bg-black/20 backdrop-blur-md text-sm font-bold border border-white/20 text-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Vertical Tiles */}
      {[side1, side2].map((game) => (
        <div
          key={game.id}
          className="rounded-[2rem] border border-[var(--color-indigo-light)] overflow-hidden relative group cursor-pointer shadow-md"
          style={{ background: game.gradient }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-purple-dark)] via-[rgba(53,34,89,0.3)] to-transparent opacity-80" />

          {game.discountLabel && (
            <div className="absolute top-5 right-5 z-10">
              <DiscountBadge label={game.discountLabel} />
            </div>
          )}

          <div className="absolute inset-x-5 bottom-5 text-[var(--bg-primary)]">
            <h3 className="text-3xl font-black leading-tight mb-2 transform group-hover:translate-x-2 transition-transform duration-300 text-white drop-shadow-md">
              {game.title}
            </h3>
            <div className="flex items-center gap-3">
              <span
                className="text-xl font-bold bg-white px-3 py-1 rounded-lg border border-white/10 shadow-sm"
                style={{
                  color: game.discountLabel
                    ? colorbadgered
                    : "var(--color-purple-dark)",
                }}
              >
                ${game.currentPrice}
              </span>
              {game.originalPrice && (
                <span className="text-sm opacity-60 line-through font-bold">
                  ${game.originalPrice}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
function CategoryPills({
  active,
  setActive,
}: {
  active: string;
  setActive: (c: string) => void;
}) {
  return (
    <div className="w-full flex items-center gap-3 overflow-x-auto pb-4 pt-12 no-scrollbar px-6 md:px-0">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => setActive(cat)}
          className={`shrink-0 px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${
            active === cat
              ? "bg-[var(--color-purple-dark)] text-[var(--bg-primary)] shadow-md transform scale-105"
              : "bg-white/45 border border-[var(--color-indigo-light)] hover:bg-white/80"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

function GameList({
  games,
  activeCategory,
}: {
  games: Game[];
  activeCategory: string;
}) {
  const displayGames = useMemo(() => {
    if (activeCategory === "For You") return games;
    return games.filter((g) => g.tags.includes(activeCategory));
  }, [games, activeCategory]);

  return (
    <section className="flex flex-col gap-4 pt-6 px-6 md:px-0">
      {displayGames.map((game) => (
        <Link
          key={game.id}
          href={`#game-${game.id}`}
          className="group block rounded-3xl border border-[var(--color-indigo-light)] bg-white/45 p-4 shadow-sm backdrop-blur transition-all duration-300 hover:shadow-xl hover:border-[var(--color-purple-dark)] hover:-translate-y-1"
        >
          <div className="flex items-center gap-6">
            <div
              className="w-40 md:w-64 aspect-[920/430] rounded-2xl overflow-hidden shrink-0 border border-[var(--color-indigo-light)]"
              style={{ background: game.gradient }}
            >
              <div className="w-full h-full bg-white/0 transition-colors duration-300 group-hover:bg-white/10" />
            </div>

            <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl md:text-3xl font-black mb-1 group-hover:text-[var(--color-purple-dark)] transition-colors">
                    {game.title}
                  </h3>
                  {game.discountLabel && (
                    <DiscountBadge label={game.discountLabel} />
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {game.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-bold bg-[var(--color-indigo-lighter)] px-2.5 py-1 rounded-lg opacity-80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end pr-4">
                {game.originalPrice && (
                  <span className="text-sm font-bold opacity-40 line-through">
                    ${game.originalPrice}
                  </span>
                )}
                <div
                  className="text-2xl md:text-3xl font-black"
                  style={{
                    color: game.discountLabel
                      ? colorbadgered
                      : "var(--color-purple-dark)",
                  }}
                >
                  ${game.currentPrice}
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}

      {displayGames.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-2xl font-bold opacity-60">
            No games found in this category.
          </p>
        </div>
      )}
    </section>
  );
}

export default function StoreOption2() {
  const [activeCategory, setActiveCategory] = useState("For You");

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--color-purple-dark)] pb-24 overflow-x-hidden selection:bg-[var(--color-purple-dark)] selection:text-[var(--bg-primary)]">
      <Head>
        <title>Discover Games | Manifold Store</title>
        <meta
          name="description"
          content="Explore the best games curated by the community."
        />
      </Head>

      <StoreTopNav games={mockGames} />

      <main className="w-full flex flex-col items-center">
        {/* Banner Section */}
        <section
          className="w-full pt-28 lg:pt-36 pb-12 overflow-hidden"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in srgb, var(--color-indigo-light) 70%, transparent), transparent)",
          }}
        >
          <div className="px-6 md:px-10 w-full flex justify-center">
            <HeroBento featured={mockGames.slice(0, 3)} />
          </div>
        </section>

        <SectionDivider />

        {/* Content Section */}
        <div
          className="w-full py-12"
          style={{
            background:
              "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-indigo-light) 30%, transparent), transparent)",
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col gap-8 px-6 md:px-10">
            <div className="flex flex-col">
              <h2 className="text-4xl font-black md:text-5xl mb-6">
                Just Arrived at Manifold
              </h2>
              <CategoryPills
                active={activeCategory}
                setActive={setActiveCategory}
              />
              <GameList games={mockGames} activeCategory={activeCategory} />
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
