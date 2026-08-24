import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { DiscountBadge } from "components/store/DiscountBadge";
import { discountBadgeColor } from "components/store/constants";
import { type GameApi } from "components/store/types";
import { PricedItem, formatBasePrice, formatPrice, isFree } from "lib/price";
import { useI18n } from "lib/i18n";

const AUTO_ADVANCE_MS = 7000;

function isEditorial(
  game: GameApi,
  mode: "EDITORIAL" | "HYBRID" | "AUTOMATIC",
) {
  return game.featured_source
    ? game.featured_source === "EDITORIAL"
    : mode === "EDITORIAL";
}

/**
 * The default storefront hero presents up to three Featured games as one
 * focused carousel. Outlet picks keep their order and automatic games fill
 * any empty slots server-side; `featured_source` prevents those fillers from
 * being presented as personal recommendations.
 */
export function HeroBento({
  featured,
  itemHref,
  mode,
  storeName,
}: {
  featured: GameApi[];
  itemHref: (slug: string) => string;
  mode: "EDITORIAL" | "HYBRID" | "AUTOMATIC";
  storeName?: string;
}) {
  const { t } = useI18n();
  const slides = featured.slice(0, 3);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || isUserPaused || isInteracting) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(interval);
  }, [slides.length, isUserPaused, isInteracting]);

  if (slides.length === 0) return null;

  const displayedIndex = Math.min(activeIndex, slides.length - 1);
  const activeGame = slides[displayedIndex];
  const activeIsEditorial = isEditorial(activeGame, mode);
  const isDemo = (item: PricedItem) => isFree(item);
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";
  const editorialLabel = storeName
    ? t("Recommended by {name}", { name: storeName })
    : t("Outlet recommendation");
  const automaticLabel = storeName
    ? t("Featured in {name}", { name: storeName })
    : t("Featured on Manifold");

  function showPrevious() {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % slides.length);
  }

  return (
    <section
      className="w-full max-w-7xl mx-auto"
      aria-label={t("Featured games")}
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={() => setIsInteracting(false)}
    >
      <div className="group relative h-[25rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[#1D0F3B] shadow-2xl md:h-[32rem]">
        <Link
          key={activeGame.id}
          href={itemHref(activeGame.slug)}
          className="absolute inset-0"
          aria-label={t("View {title}", { title: activeGame.title })}
        >
          <div
            className="absolute inset-0 animate-[fadeIn_350ms_ease-out] transition-transform duration-1000 ease-out group-hover:scale-[1.025]"
            style={{
              background: activeGame.media?.banner
                ? `url(${activeGame.media.banner}) center/cover no-repeat`
                : defaultGradient,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#120923]/95 via-[#1D0F3B]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#120923] via-transparent to-black/20" />

          {!isDemo(activeGame) &&
            formatBasePrice(activeGame) !== null &&
            activeGame.discount_label && (
              <div className="absolute right-5 top-5 z-10 md:right-8 md:top-8 md:scale-110">
                <DiscountBadge label={activeGame.discount_label} />
              </div>
            )}

          <div className="absolute inset-x-6 bottom-8 flex max-w-3xl flex-col items-start text-white md:inset-x-12 md:bottom-12">
            <span className="mb-4 max-w-full truncate rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/85 backdrop-blur-md md:text-xs">
              {activeIsEditorial ? editorialLabel : automaticLabel}
            </span>
            <h2 className="max-w-full text-3xl font-black leading-[0.95] tracking-tight text-white drop-shadow-2xl sm:text-5xl md:text-7xl">
              {activeGame.title}
            </h2>
            {activeIsEditorial && activeGame.recommendation_reason && (
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-white/85 line-clamp-3 drop-shadow-md md:text-lg">
                {activeGame.recommendation_reason}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-xl border bg-black/60 px-4 py-2 text-lg font-black uppercase shadow-2xl backdrop-blur-md md:text-2xl ${
                  !isDemo(activeGame) && formatBasePrice(activeGame) !== null
                    ? ""
                    : "border-white/20 text-white"
                }`}
                style={
                  !isDemo(activeGame) &&
                  activeGame.base_price &&
                  formatBasePrice(activeGame) !== null
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {isDemo(activeGame) ? t("Free Demo") : formatPrice(activeGame)}
              </span>
              {!isDemo(activeGame) &&
                activeGame.base_price &&
                formatBasePrice(activeGame) !== null && (
                  <span className="text-base font-bold text-white/45 line-through md:text-lg">
                    {formatBasePrice(activeGame)}
                  </span>
                )}
              {(activeGame.tags || []).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/75 backdrop-blur-md md:inline-flex"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </Link>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={showPrevious}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 p-2.5 text-white/75 backdrop-blur-md transition hover:bg-black/60 hover:text-white md:left-5 md:p-3"
              aria-label={t("Previous Featured game")}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={showNext}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 p-2.5 text-white/75 backdrop-blur-md transition hover:bg-black/60 hover:text-white md:right-5 md:p-3"
              aria-label={t("Next Featured game")}
            >
              <ChevronRight size={22} />
            </button>
            <button
              type="button"
              onClick={() => setIsUserPaused((paused) => !paused)}
              className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/35 p-2.5 text-white/75 backdrop-blur-md transition hover:bg-black/60 hover:text-white md:right-7 md:top-7"
              aria-label={
                isUserPaused
                  ? t("Resume Featured carousel")
                  : t("Pause Featured carousel")
              }
            >
              {isUserPaused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          </>
        )}
      </div>

      <div
        className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
        role="tablist"
        aria-label={t("Choose a Featured game")}
      >
        {slides.map((game, index) => {
          const editorial = isEditorial(game, mode);
          const active = index === displayedIndex;
          return (
            <button
              key={game.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveIndex(index)}
              className={`group/option flex min-w-0 items-center gap-3 rounded-2xl border p-2 text-left transition md:p-3 ${
                active
                  ? "border-violet-400/60 bg-violet-400/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
              }`}
            >
              <div
                className="h-14 w-24 shrink-0 rounded-xl bg-[#21152f] sm:h-12 sm:w-20 lg:h-16 lg:w-28"
                style={{
                  background: game.media?.banner
                    ? `url(${game.media.banner}) center/cover no-repeat`
                    : defaultGradient,
                }}
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-white lg:text-base">
                  {game.title}
                </span>
                <span
                  className={`mt-0.5 block truncate text-[10px] font-black uppercase tracking-wider ${
                    editorial ? "text-violet-300" : "text-white/35"
                  }`}
                >
                  {editorial ? t("Outlet pick") : t("Automatic pick")}
                </span>
              </div>
              <span className="shrink-0 pr-1 text-xs font-black text-white/30">
                0{index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
