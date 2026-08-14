import Link from "next/link";

import { DiscountBadge } from "components/store/DiscountBadge";
import { discountBadgeColor } from "components/store/constants";
import { type GameApi } from "components/store/types";
import { PricedItem, formatBasePrice, formatPrice, isFree } from "lib/price";

/**
 * The default storefront's hero: one large tile plus two stacked ones.
 *
 * Renders whatever it is given rather than bailing out below three entries —
 * it used to return null, which left a brand-new outlet with two curated games
 * showing an empty band and no explanation. The grid spans adapt instead.
 */
export function HeroBento({
  featured,
  itemHref,
}: {
  featured: GameApi[];
  itemHref: (slug: string) => string;
}) {
  if (!featured || featured.length === 0) return null;
  const [main, ...rest] = featured;
  const sides = rest.slice(0, 2);

  // With no side tiles the main one has nothing to sit beside, so it takes the
  // full width instead of leaving a dead column.
  const mainSpan =
    sides.length > 0
      ? "md:col-span-2 md:row-span-2"
      : "md:col-span-3 md:row-span-2";

  // Kept as a local alias so the many call sites below read the same as before.
  const isDemo = (item: PricedItem) => isFree(item);
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-7xl mx-auto auto-rows-[200px] md:auto-rows-[240px]">
      {/* Main Massive Tile */}
      <Link
        href={itemHref(main.slug)}
        className={`${mainSpan} rounded-[2rem] border border-white/10 overflow-hidden relative group cursor-pointer shadow-2xl`}
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

        {!isDemo(main) &&
          formatBasePrice(main) !== null &&
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
                className={`text-xl md:text-3xl font-black bg-black/60 backdrop-blur-md px-3 py-1 md:px-4 md:py-1.5 rounded-xl shadow-2xl border uppercase ${!isDemo(main) && formatBasePrice(main) !== null ? "" : "text-white border-white/20"}`}
                style={
                  !isDemo(main) &&
                  main.base_price &&
                  formatBasePrice(main) !== null
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {isDemo(main) ? "Free Demo" : formatPrice(main)}
              </span>
              {!isDemo(main) &&
                main.base_price &&
                formatBasePrice(main) !== null && (
                  <span className="text-sm md:text-lg text-white/40 line-through font-bold">
                    {formatBasePrice(main)}
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
      {sides.map((game) => (
        <Link
          key={game.id}
          href={itemHref(game.slug)}
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

          {!isDemo(game) &&
            formatBasePrice(game) !== null &&
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
                className={`text-xl md:text-2xl font-bold bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border shadow-lg uppercase ${!isDemo(game) && formatBasePrice(game) !== null ? "" : "text-white border-white/20"}`}
                style={
                  !isDemo(game) &&
                  game.base_price &&
                  formatBasePrice(game) !== null
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {isDemo(game) ? "Free Demo" : formatPrice(game)}
              </span>
              {!isDemo(game) &&
                game.base_price &&
                formatBasePrice(game) !== null && (
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
