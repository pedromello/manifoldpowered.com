import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useState, useMemo } from "react";

// --- Types & Mock Data ---

export type Game = {
  id: string;
  title: string;
  price: string;
  tags: string[];
  gradient: string;
};

// We create a wide variety of gradients ensuring we strictly reuse
// the established brand color variables without adding new dominant hues
const BRAND_GRADIENTS = [
  "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)",
  "linear-gradient(45deg, var(--color-indigo-light) 0%, var(--color-purple-dark) 100%)",
  "linear-gradient(180deg, var(--color-indigo-lighter) 0%, var(--color-indigo-light) 100%)",
  "linear-gradient(210deg, var(--color-purple-dark) 0%, rgba(214,205,255,0.4) 100%)",
  "radial-gradient(circle at top right, var(--color-indigo-light) 0%, var(--color-purple-dark) 100%)",
  "linear-gradient(to right, rgba(53,34,89,0.9), rgba(53,34,89,0.5))",
];

const mockGames: Game[] = [
  {
    id: "1",
    title: "Astral Ascent",
    price: "24.99",
    tags: ["Action", "Rogue-lite"],
    gradient: BRAND_GRADIENTS[0],
  },
  {
    id: "2",
    title: "Neon Drifter",
    price: "19.99",
    tags: ["Racing", "Cyberpunk"],
    gradient: BRAND_GRADIENTS[1],
  },
  {
    id: "3",
    title: "Valley Forge",
    price: "14.99",
    tags: ["Simulation", "Strategy"],
    gradient: BRAND_GRADIENTS[2],
  },
  {
    id: "4",
    title: "Echoes of Eternity",
    price: "29.99",
    tags: ["RPG", "Story-Rich"],
    gradient: BRAND_GRADIENTS[3],
  },
  {
    id: "5",
    title: "Void Crawler",
    price: "9.99",
    tags: ["Horror", "Survival"],
    gradient: BRAND_GRADIENTS[4],
  },
  {
    id: "6",
    title: "Cozy Tavern",
    price: "12.99",
    tags: ["Simulation", "Casual"],
    gradient: BRAND_GRADIENTS[5],
  },
  {
    id: "7",
    title: "Blade Master",
    price: "19.99",
    tags: ["Action", "Hack & Slash"],
    gradient: BRAND_GRADIENTS[0],
  },
  {
    id: "8",
    title: "Star Command",
    price: "34.99",
    tags: ["Strategy", "Sci-Fi"],
    gradient: BRAND_GRADIENTS[1],
  },
  {
    id: "9",
    title: "Pixel Farm",
    price: "14.99",
    tags: ["Simulation", "Indie"],
    gradient: BRAND_GRADIENTS[2],
  },
  {
    id: "10",
    title: "Shadow Step",
    price: "21.99",
    tags: ["Stealth", "Action"],
    gradient: BRAND_GRADIENTS[3],
  },
  {
    id: "11",
    title: "Mythic Hearts",
    price: "29.99",
    tags: ["RPG", "Fantasy"],
    gradient: BRAND_GRADIENTS[4],
  },
  {
    id: "12",
    title: "Circuit Breaker",
    price: "15.99",
    tags: ["Puzzle", "Logic"],
    gradient: BRAND_GRADIENTS[5],
  },
];

const CATEGORIES = [
  "For You",
  "Action",
  "RPG",
  "Simulation",
  "Horror",
  "Strategy",
  "Racing",
  "Indie",
];

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
                        <h4 className="font-bold text-[var(--color-purple-dark)] truncate">
                          {game.title}
                        </h4>
                        <p className="text-sm font-semibold opacity-70">
                          ${game.price}
                        </p>
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
        <div className="absolute inset-x-6 bottom-6 md:inset-x-10 md:bottom-10 text-[var(--bg-primary)] flex flex-col items-start">
          <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 text-white">
            Featured Match
          </span>
          <h2 className="text-5xl md:text-[5rem] font-black leading-none mb-2 tracking-tight transform group-hover:scale-105 transition-transform duration-500 origin-bottom-left text-white drop-shadow-md">
            {main.title}
          </h2>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-2xl font-black bg-white text-[var(--color-purple-dark)] px-4 py-1.5 rounded-xl">
              ${main.price}
            </span>
            <div className="flex gap-2">
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
      <div
        className="rounded-[2rem] border border-[var(--color-indigo-light)] overflow-hidden relative group cursor-pointer shadow-md"
        style={{ background: side1.gradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-purple-dark)] via-[rgba(53,34,89,0.3)] to-transparent opacity-80" />
        <div className="absolute inset-x-5 bottom-5 text-[var(--bg-primary)]">
          <h3 className="text-3xl font-black leading-tight mb-2 transform group-hover:translate-x-2 transition-transform duration-300 text-white drop-shadow-md">
            {side1.title}
          </h3>
          <span className="text-xl font-bold bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg border border-white/10 text-white">
            ${side1.price}
          </span>
        </div>
      </div>

      <div
        className="rounded-[2rem] border border-[var(--color-indigo-light)] overflow-hidden relative group cursor-pointer shadow-md"
        style={{ background: side2.gradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-purple-dark)] via-[rgba(53,34,89,0.3)] to-transparent opacity-80" />
        <div className="absolute inset-x-5 bottom-5 text-[var(--bg-primary)]">
          <h3 className="text-3xl font-black leading-tight mb-2 transform group-hover:translate-x-2 transition-transform duration-300 text-white drop-shadow-md">
            {side2.title}
          </h3>
          <span className="text-xl font-bold bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg border border-white/10 text-white">
            ${side2.price}
          </span>
        </div>
      </div>
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

function GameGrid({
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
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-6 px-6 md:px-0">
      {displayGames.map((game, i) => (
        <article
          key={game.id}
          className="group rounded-3xl border border-[var(--color-indigo-light)] bg-white/45 p-3 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-[var(--color-purple-dark)] flex flex-col"
        >
          <div
            className="w-full h-48 rounded-[1.25rem] overflow-hidden mb-4 relative"
            style={{ background: game.gradient }}
          >
            {/* Sub-tle overlay on hover */}
            <div className="absolute inset-0 bg-white/0 transition-colors duration-300 group-hover:bg-white/10" />
          </div>

          <div className="px-2 pb-2 flex-1 flex flex-col">
            <h3 className="text-2xl font-black mb-1 leading-tight">
              {game.title}
            </h3>

            <div className="flex gap-2 mb-4 flex-wrap mt-2">
              {game.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-bold bg-[var(--color-indigo-lighter)] px-2 py-1 rounded-md opacity-80"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between pt-4 border-t border-[rgba(53,34,89,0.08)]">
              <span className="text-xl font-bold">${game.price}</span>
              <button className="bg-[var(--color-purple-dark)] text-[var(--bg-primary)] px-4 py-2 rounded-xl font-bold text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                Buy Now
              </button>
            </div>
          </div>
        </article>
      ))}

      {displayGames.length === 0 && (
        <div className="col-span-full py-20 text-center">
          <p className="text-2xl font-bold opacity-60">
            No games found in this category.
          </p>
        </div>
      )}
    </section>
  );
}

export default function Store() {
  const [activeCategory, setActiveCategory] = useState("For You");

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--color-purple-dark)] pb-24 overflow-x-hidden selection:bg-[var(--color-purple-dark)] selection:text-[var(--bg-primary)]">
      <Head>
        <title>Manifold Store | Discover Community Curated Games</title>
        <meta
          name="description"
          content="Discover, buy, and support creators through community curated games."
        />
      </Head>

      <StoreTopNav games={mockGames} />

      <main className="w-full flex flex-col items-center">
        {/* Hero Section with distinctive background */}
        <section
          className="w-full pt-28 lg:pt-36 pb-12 overflow-hidden"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in srgb, var(--color-indigo-light) 70%, transparent), transparent)",
          }}
        >
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <HeroBento featured={mockGames.slice(0, 3)} />
          </div>
        </section>

        <SectionDivider />

        {/* Content Section */}
        <div
          className="w-full py-8"
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
              <GameGrid games={mockGames} activeCategory={activeCategory} />
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        /* Hide scrollbar for category pills but keep functionality */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }
      `}</style>
    </div>
  );
}
