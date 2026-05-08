import Head from "next/head";
import Link from "next/link";
import Form from "next/form";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Search } from "lucide-react";

import { CATEGORIES } from "lib/games";

// --- Components ---
import { StoreLayout } from "components/store/StoreLayout";
import { DiscountBadge } from "components/store/DiscountBadge";
import { SectionDivider } from "components/store/SectionDivider";
import { discountBadgeColor } from "components/store/constants";
import { GameListItem, type GameApi } from "components/store/GameListItem";

function HeroBento({ featured }: { featured: GameApi[] }) {
  if (!featured || featured.length < 3) return null;
  const [main, side1, side2] = featured;

  const isDemo = (price: string) => !price || Number(price) === 0;
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-7xl mx-auto auto-rows-[200px] md:auto-rows-[240px]">
      {/* Main Massive Tile */}
      <Link
        href={`/item/${main.slug}`}
        className="md:col-span-2 md:row-span-2 rounded-[2rem] border border-white/10 overflow-hidden relative group cursor-pointer shadow-2xl"
      >
        {/* Background Layer */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
          style={{
            background: main.media?.banner
              ? `url(${main.media.banner}) center/cover no-repeat`
              : defaultGradient,
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#1D0F3B]/90 via-[#1D0F3B]/20 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />

        {!isDemo(main.price) &&
          main.base_price !== main.price &&
          main.discount_label && (
            <div className="absolute top-5 right-5 z-10 md:top-8 md:right-8 md:scale-120 origin-top-right">
              <DiscountBadge label={main.discount_label} />
            </div>
          )}

        <div className="absolute inset-x-4 bottom-4 md:inset-x-10 md:bottom-10 text-white flex flex-col items-start min-w-0 max-w-full">
          <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold tracking-widest uppercase mb-3 text-white/80 border border-white/5">
            Featured Match
          </span>
          <h2 className="w-full text-xl md:text-3xl lg:text-5xl font-black leading-none mb-2 tracking-tight transform group-hover:scale-105 transition-transform duration-500 origin-bottom-left text-white drop-shadow-2xl truncate">
            {main.title}
          </h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-3">
              <span
                className={`text-xl md:text-3xl font-black bg-black/60 backdrop-blur-md px-3 py-1 md:px-4 md:py-1.5 rounded-xl shadow-2xl border uppercase ${!isDemo(main.price) && main.base_price && main.base_price !== main.price ? "" : "text-white border-white/20"}`}
                style={
                  !isDemo(main.price) &&
                  main.base_price &&
                  main.base_price !== main.price
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {isDemo(main.price) ? "Free Demo" : `$${main.price}`}
              </span>
              {!isDemo(main.price) &&
                main.base_price &&
                main.base_price !== main.price && (
                  <span className="text-sm md:text-lg text-white/40 line-through font-bold">
                    ${main.base_price}
                  </span>
                )}
            </div>
            <div className="flex gap-2 self-end mb-1">
              {(main.tags || []).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="hidden md:inline-flex px-3 py-1.5 rounded-xl bg-white/5 backdrop-blur-md text-base font-bold border border-white/10 text-white/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>

      {/* Secondary Vertical Tiles */}
      {[side1, side2].map((game) => (
        <Link
          key={game.id}
          href={`/item/${game.slug}`}
          className="rounded-[2rem] border border-white/10 overflow-hidden relative group cursor-pointer shadow-xl"
        >
          {/* Background Layer */}
          <div
            className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
            style={{
              background: game.media?.banner
                ? `url(${game.media.banner}) center/cover no-repeat`
                : defaultGradient,
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-[#1D0F3B]/80 via-[#1D0F3B]/20 to-transparent opacity-80" />

          {!isDemo(game.price) &&
            game.base_price !== game.price &&
            game.discount_label && (
              <div className="absolute top-5 right-5 z-10">
                <DiscountBadge label={game.discount_label} />
              </div>
            )}

          <div className="absolute inset-x-4 bottom-4 text-white min-w-0 max-w-full">
            <h3 className="w-full text-xl md:text-3xl font-black leading-tight mb-2 motion-safe:group-hover:translate-x-2 transition-transform duration-300 text-white drop-shadow-md truncate">
              {game.title}
            </h3>
            <div className="flex items-center gap-3">
              <span
                className={`text-xl md:text-2xl font-bold bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border shadow-lg uppercase ${!isDemo(game.price) && game.base_price && game.base_price !== game.price ? "" : "text-white border-white/20"}`}
                style={
                  !isDemo(game.price) &&
                  game.base_price &&
                  game.base_price !== game.price
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {isDemo(game.price) ? "Free Demo" : `$${game.price}`}
              </span>
              {!isDemo(game.price) &&
                game.base_price &&
                game.base_price !== game.price && (
                  <span className="text-sm md:text-base text-white/40 line-through font-bold">
                    ${game.base_price}
                  </span>
                )}
            </div>
          </div>
        </Link>
      ))}
    </section>
  );
}

function CategoryPills({ active }: { active: string | null }) {
  return (
    <div className="w-full flex items-center gap-3 overflow-x-auto pb-4 pt-4 no-scrollbar px-6 md:px-0">
      {CATEGORIES.map((cat) => (
        <Link
          href={cat === "For You" ? "/store" : `/store?category=${cat}`}
          key={cat}
          className={`shrink-0 px-6 py-3.5 md:py-4 md:px-8 rounded-2xl font-bold transition-all duration-300 min-h-[44px] text-sm md:text-lg inline-flex items-center justify-center ${
            (!active && cat === "For You") || active === cat
              ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)] motion-safe:transform motion-safe:scale-105"
              : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          {cat}
        </Link>
      ))}
    </div>
  );
}

export default function StoreOption2() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  const category = searchParams.get("category");

  const queryUrl = new URLSearchParams();
  if (q) queryUrl.set("q", q);
  if (category) queryUrl.set("tags", category);

  const { data: featuredData, isLoading: isFeaturedLoading } = useSWR<{
    games: GameApi[];
  }>("/api/v1/games", (url) => fetch(url).then((res) => res.json()));

  const { data, isLoading } = useSWR<{ games: GameApi[] }>(
    `/api/v1/games?${queryUrl.toString()}`,
    (url) => fetch(url).then((res) => res.json()),
  );

  const displayGames = data?.games || [];
  const featuredGames = featuredData?.games || [];

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      <Head>
        <title>Discover (Dark) | Manifold Store</title>
        <meta
          name="description"
          content="Explore the best games curated by the community in premium dark mode."
        />
        <meta name="theme-color" content="#1D0F3B" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </Head>

      <style jsx global>{`
        html,
        body {
          background-color: #1d0f3b !important;
        }
      `}</style>

      <main className="w-full flex flex-col items-center">
        {/* Banner Section with high-contrast background */}
        <section
          className="w-full pt-28 lg:pt-36 pb-12 overflow-hidden"
          style={{
            background:
              "linear-gradient(to bottom, rgba(165,180,252,0.05) 0%, rgba(53,34,89,0.2) 60%, transparent 100%)",
          }}
        >
          <div className="px-6 md:px-10 w-full flex justify-center">
            {isFeaturedLoading ? (
              <div className="flex h-64 items-center justify-center w-full max-w-7xl">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
              </div>
            ) : (
              <HeroBento featured={featuredGames.slice(0, 3)} />
            )}
          </div>
        </section>

        <SectionDivider />

        {/* Content Section */}
        <div
          className="w-full py-12 md:py-24"
          style={{
            background:
              "linear-gradient(to bottom, rgba(165, 180, 252, 0.16) 0%, rgba(53,34,89,0.2) 30%, #1D0F3B 100%)",
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col gap-8 px-1 md:px-10">
            <div className="flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-5 mb-6">
                <h1 className="text-4xl font-black md:text-6xl text-white drop-shadow-sm max-w-[20ch]">
                  Just Arrived at Manifold
                </h1>

                <Form
                  action="/search"
                  className="relative w-full md:w-80 group"
                >
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors">
                    <Search size={20} />
                  </div>
                  <input
                    type="text"
                    name="q"
                    defaultValue={q || ""}
                    placeholder="Search games..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/10 transition-all shadow-inner"
                  />
                  {category && (
                    <input type="hidden" name="category" value={category} />
                  )}
                </Form>
              </div>

              <CategoryPills active={category} />

              <section className="flex flex-col gap-4 pt-6">
                {isLoading ? (
                  <div className="py-20 flex justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white/20"></div>
                  </div>
                ) : displayGames.length > 0 ? (
                  displayGames.map((game) => (
                    <GameListItem key={game.id} game={game} />
                  ))
                ) : (
                  <div className="py-20 text-center text-white/20 font-black italic text-4xl uppercase tracking-tighter">
                    Empty Archives
                  </div>
                )}
              </section>
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
      `}</style>
    </div>
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
