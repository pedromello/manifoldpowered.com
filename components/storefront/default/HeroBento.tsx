import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { DiscountBadge } from "components/store/DiscountBadge";
import { GameArtwork } from "components/store/GameArtwork";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import { discountBadgeColor } from "components/store/constants";
import { type GameApi } from "components/store/types";
import {
  catalogDiscountLabel,
  formatCatalogBasePrice,
  formatCatalogPrice,
  isCatalogFree,
} from "lib/price";
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
  const activeFree = isCatalogFree(activeGame);
  const activeIsDemo = activeGame.purchase_mode === "PLATFORM" && activeFree;
  const activeBasePrice = formatCatalogBasePrice(activeGame);
  const activeDiscountLabel = catalogDiscountLabel(activeGame);
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
      <div className="group flex min-h-[25rem] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#1D0F3B] shadow-2xl md:min-h-[32rem]">
        <Link
          key={activeGame.id}
          href={itemHref(activeGame.slug)}
          className="grid flex-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
          aria-label={t("View {title}", { title: activeGame.title })}
        >
          <GameArtwork
            src={activeGame.media?.banner}
            loading="eager"
            className="aspect-[16/9] w-full md:aspect-auto"
          />
          <div className="flex min-w-0 flex-col items-start justify-center p-6 text-white md:p-8">
            {!activeFree && activeBasePrice && activeDiscountLabel && (
              <div className="mb-4">
                <DiscountBadge label={activeDiscountLabel} />
              </div>
            )}
            <span className="mb-4 max-w-full truncate rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/85 backdrop-blur-md md:text-xs">
              {activeIsEditorial ? editorialLabel : automaticLabel}
            </span>
            <h2 className="max-w-full text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              {activeGame.title}
            </h2>
            {storeName && (
              <div className="mt-3">
                <OutletRatingBadge rating={activeGame.outlet_review?.rating} />
              </div>
            )}
            {activeIsEditorial && activeGame.recommendation_reason && (
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-white/85 line-clamp-3 drop-shadow-md md:text-lg">
                {activeGame.recommendation_reason}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-xl border bg-black/60 px-4 py-2 text-lg font-black uppercase shadow-2xl backdrop-blur-md md:text-2xl ${
                  !activeFree && activeBasePrice
                    ? ""
                    : "border-white/20 text-white"
                }`}
                style={
                  !activeFree && activeBasePrice
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {activeFree
                  ? activeIsDemo
                    ? t("Free Demo")
                    : t("Free")
                  : t(formatCatalogPrice(activeGame))}
              </span>
              {!activeFree && activeBasePrice && (
                <span className="text-base font-bold text-white/45 line-through md:text-lg">
                  {activeBasePrice}
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
          <div className="flex justify-end gap-2 border-t border-white/10 p-3">
            <button
              type="button"
              onClick={showPrevious}
              className="rounded-full border border-white/10 bg-black/35 p-2.5 text-white/75 transition hover:bg-black/60 hover:text-white md:p-3"
              aria-label={t("Previous Featured game")}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={showNext}
              className="rounded-full border border-white/10 bg-black/35 p-2.5 text-white/75 transition hover:bg-black/60 hover:text-white md:p-3"
              aria-label={t("Next Featured game")}
            >
              <ChevronRight size={22} />
            </button>
            <button
              type="button"
              onClick={() => setIsUserPaused((paused) => !paused)}
              className="rounded-full border border-white/10 bg-black/35 p-2.5 text-white/75 transition hover:bg-black/60 hover:text-white"
              aria-label={
                isUserPaused
                  ? t("Resume Featured carousel")
                  : t("Pause Featured carousel")
              }
            >
              {isUserPaused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          </div>
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
              <GameArtwork
                src={game.media?.banner}
                className="h-14 w-24 shrink-0 rounded-xl bg-[#21152f] sm:h-12 sm:w-20 lg:h-16 lg:w-28"
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
