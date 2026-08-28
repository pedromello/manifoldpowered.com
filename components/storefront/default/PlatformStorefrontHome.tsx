import Form from "next/form";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react";

import { DiscoverOutlets } from "components/store/DiscoverOutlets";
import { DiscountBadge } from "components/store/DiscountBadge";
import type { GameApi } from "components/store/types";
import type { DefaultStorefrontProps } from "components/storefront/types";
import {
  catalogDiscountLabel,
  formatCatalogBasePrice,
  formatCatalogPrice,
  isCatalogFree,
} from "lib/price";
import { useI18n } from "lib/i18n";

function Price({ game, large = false }: { game: GameApi; large?: boolean }) {
  const basePrice = formatCatalogBasePrice(game);
  const { t } = useI18n();

  return (
    <div className="flex items-baseline gap-2">
      {basePrice && (
        <span className="text-xs font-semibold text-white/35 line-through">
          {basePrice}
        </span>
      )}
      <span
        className={`${large ? "text-xl" : "text-sm"} font-black text-white`}
      >
        {isCatalogFree(game) ? t("Free") : formatCatalogPrice(game)}
      </span>
    </div>
  );
}

function commercialLabel(game: GameApi, t: (message: string) => string) {
  if (isCatalogFree(game)) {
    return game.purchase_mode === "PLATFORM" ? t("Free Demo") : t("Free");
  }
  const discountLabel = catalogDiscountLabel(game);
  if (discountLabel && formatCatalogBasePrice(game)) {
    return discountLabel;
  }
  return formatCatalogPrice(game);
}

function HeroSkeleton() {
  return (
    <div className="grid min-h-[340px] animate-pulse overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.035] md:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]">
      <div className="min-h-[240px] bg-white/[0.04]" />
      <div className="space-y-5 p-7">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="h-10 w-4/5 rounded bg-white/10" />
        <div className="h-16 rounded bg-white/[0.06]" />
        <div className="h-11 rounded-lg bg-white/10" />
      </div>
    </div>
  );
}

function Spotlight({
  game,
  itemHref,
  storeName,
}: {
  game: GameApi;
  itemHref: string;
  storeName?: string;
}) {
  const { t } = useI18n();
  return (
    <article className="grid overflow-hidden rounded-xl border border-white/[0.1] bg-[#14101c] md:min-h-[360px] md:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
      <Link
        href={itemHref}
        data-storefront="game-link"
        className="group relative min-h-[240px] overflow-hidden bg-[#21182f] md:min-h-full"
      >
        {game.media?.banner ? (
          // Game banners may be hosted outside Next's image allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.media.banner}
            alt={t("{title} banner", { title: game.title })}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#28183b,#15101d)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5 md:bg-gradient-to-r md:from-transparent md:to-black/20" />
      </Link>

      <div className="flex flex-col justify-center p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
          {storeName
            ? t("Featured in {name}", { name: storeName })
            : t("Now on Manifold")}
        </p>
        <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-0.025em] text-white sm:text-4xl">
          {game.title}
        </h2>
        <p className="mt-2 text-sm font-semibold text-white/45">
          {t("by {name}", { name: game.developer_name })}
        </p>
        {(game.recommendation_reason || game.description) && (
          <p className="mt-5 line-clamp-3 text-sm leading-6 text-white/60">
            {game.recommendation_reason || game.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {(game.tags || []).slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/[0.09] px-2 py-1 text-[11px] font-semibold text-white/50"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-7 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
          <Price game={game} large />
          <Link
            href={itemHref}
            data-storefront="game-link"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-sm font-bold text-white hover:from-fuchsia-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 focus:ring-offset-[#14101c]"
          >
            {t("View game")}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function SpotlightCarousel({
  games,
  itemHref,
  storeName,
}: {
  games: GameApi[];
  itemHref: (slug: string) => string;
  storeName?: string;
}) {
  const { t } = useI18n();
  const slides = games.slice(0, 3);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || isUserPaused || isInteracting) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(interval);
  }, [slides.length, isUserPaused, isInteracting]);

  if (slides.length === 0) return null;

  const displayedIndex = Math.min(activeIndex, slides.length - 1);
  const activeGame = slides[displayedIndex];

  return (
    <div
      aria-label={
        storeName
          ? t("Featured games in {name}", { name: storeName })
          : t("Featured games on Manifold")
      }
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={() => setIsInteracting(false)}
    >
      <Spotlight
        game={activeGame}
        itemHref={itemHref(activeGame.slug)}
        storeName={storeName}
      />

      {slides.length > 1 && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-2 sm:hidden">
            <button
              type="button"
              onClick={() =>
                setActiveIndex(
                  (current) => (current - 1 + slides.length) % slides.length,
                )
              }
              className="rounded-lg border border-white/10 p-2.5 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label={t("Previous Featured game")}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
              {t("{current} of {total}", {
                current: displayedIndex + 1,
                total: slides.length,
              })}
            </span>
            <button
              type="button"
              onClick={() => setIsUserPaused((currentPaused) => !currentPaused)}
              className="rounded-lg border border-white/10 p-2.5 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label={
                isUserPaused
                  ? t("Resume Featured carousel")
                  : t("Pause Featured carousel")
              }
            >
              {isUserPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveIndex((current) => (current + 1) % slides.length)
              }
              className="rounded-lg border border-white/10 p-2.5 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label={t("Next Featured game")}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mt-3 hidden grid-cols-[auto_repeat(3,minmax(0,1fr))_auto] gap-2 sm:grid">
            <button
              type="button"
              onClick={() =>
                setActiveIndex(
                  (current) => (current - 1 + slides.length) % slides.length,
                )
              }
              className="flex items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 text-white/45 transition hover:border-white/20 hover:text-white"
              aria-label={t("Previous Featured game")}
            >
              <ChevronLeft size={19} />
            </button>

            {slides.map((game, index) => {
              const active = index === displayedIndex;
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-current={active ? "true" : undefined}
                  className={`min-w-0 rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-violet-400/50 bg-violet-400/[0.09]"
                      : "border-white/[0.09] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"
                  }`}
                >
                  <span className="block truncate text-sm font-bold text-white">
                    {game.title}
                  </span>
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">
                    {commercialLabel(game, t)}
                  </span>
                </button>
              );
            })}

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setIsUserPaused((currentPaused) => !currentPaused)
                }
                className="flex flex-1 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 text-white/45 transition hover:border-white/20 hover:text-white"
                aria-label={
                  isUserPaused
                    ? t("Resume Featured carousel")
                    : t("Pause Featured carousel")
                }
              >
                {isUserPaused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((current) => (current + 1) % slides.length)
                }
                className="flex flex-1 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 text-white/45 transition hover:border-white/20 hover:text-white"
                aria-label={t("Next Featured game")}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GameCard({ game, href }: { game: GameApi; href: string }) {
  const discountLabel = catalogDiscountLabel(game);
  return (
    <Link
      href={href}
      data-storefront="game-link"
      className="group min-w-0 overflow-hidden rounded-xl border border-white/[0.09] bg-[#14101c] transition-colors hover:border-white/20 hover:bg-[#181320]"
    >
      <div className="relative aspect-[920/430] overflow-hidden bg-[#21182f]">
        {game.media?.banner ? (
          // Game banners may be hosted outside Next's image allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.media.banner}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(135deg,#28183b,#15101d)]" />
        )}
        {discountLabel && formatCatalogBasePrice(game) && (
          <span className="absolute bottom-2 left-2">
            <DiscountBadge label={discountLabel} size="small" />
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-white transition-colors group-hover:text-violet-200">
              {game.title}
            </h3>
            <p className="mt-1 truncate text-xs font-medium text-white/40">
              {game.developer_name}
            </p>
          </div>
          <Price game={game} />
        </div>
        {game.tags?.length > 0 && (
          <p className="mt-4 truncate text-xs text-white/35">
            {game.tags.slice(0, 3).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}

function PreviewNotice() {
  const [visible, setVisible] = useState(true);
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-violet-400/20 bg-violet-400/[0.06] px-4 py-3 text-sm text-violet-100/75">
      <Check size={17} className="mt-0.5 shrink-0 text-violet-300" />
      <p className="flex-1 leading-5">
        {t(
          "Manifold is in preview. You can explore games and Outlets while we finish the purchasing experience.",
        )}
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={t("Dismiss preview notice")}
        className="rounded p-0.5 text-white/35 hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function PlatformStorefrontHome({
  store,
  followControl,
  featured,
  isFeaturedLoading,
  games,
  isLoading,
  q,
  activeCategory,
  categories,
  order,
  setOrder,
  itemHref,
  browseHref,
  searchAction,
  showDiscover,
}: DefaultStorefrontProps) {
  const { t } = useI18n();
  const spotlightGames = (featured.length > 0 ? featured : games).slice(0, 3);
  const categoryLinks = useMemo(
    () =>
      categories.map((label) => ({
        label,
        value: label === "For You" ? null : label,
      })),
    [categories],
  );

  return (
    <main className="min-h-screen bg-[#0b0812] pb-16 text-white lg:pb-0">
      <section className="mx-auto max-w-[1500px] px-4 pb-8 pt-7 sm:px-6 lg:px-10 lg:pt-9">
        <PreviewNotice />

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {store ? (
            <div className="flex min-w-0 items-start gap-4">
              {store.logo_url && (
                // Outlet logos are arbitrary user-supplied URLs.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logo_url}
                  alt={t("{name} logo", { name: store.name })}
                  className="h-14 w-14 shrink-0 rounded-xl border border-white/10 bg-white/[0.04] object-cover sm:h-16 sm:w-16"
                />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
                  {t("Outlet")}
                </p>
                <h1 className="mt-1 max-w-3xl break-words text-3xl font-black tracking-[-0.025em] sm:text-4xl">
                  {store.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
                  {store.description ||
                    t("Explore {name}'s curated catalog on Manifold.", {
                      name: store.name,
                    })}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="max-w-2xl text-2xl font-black tracking-[-0.02em] sm:text-3xl">
                {t("Think Steam, but with creator-run storefronts.")}
              </h1>
            </div>
          )}

          {store ? (
            <div className="shrink-0">{followControl}</div>
          ) : (
            <p className="max-w-md text-sm leading-6 text-white/45 sm:text-right">
              {t(
                "Buy games and keep them in one library while independent Outlets can earn commission on the sales they refer.",
              )}
            </p>
          )}
        </div>

        {isFeaturedLoading && spotlightGames.length === 0 ? (
          <HeroSkeleton />
        ) : spotlightGames.length > 0 ? (
          <SpotlightCarousel
            games={spotlightGames}
            itemHref={itemHref}
            storeName={store?.name}
          />
        ) : (
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-6 text-center text-white/40">
            {t("The first games are being prepared for the catalog.")}
          </div>
        )}
      </section>

      <section
        id="catalog"
        data-storefront="game-list"
        aria-busy={isLoading}
        className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-white/35">
              {store
                ? t("{name}'s catalog", { name: store.name })
                : t("Shared catalog")}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.025em]">
              {t("Explore games")}
            </h2>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
            <Form action={searchAction} className="relative sm:w-72">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                type="search"
                name="q"
                data-storefront="search"
                defaultValue={q}
                placeholder={
                  store
                    ? t("Search games in this Outlet...")
                    : t("Search the catalog")
                }
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              />
              {activeCategory && (
                <input type="hidden" name="category" value={activeCategory} />
              )}
            </Form>

            <div className="relative sm:w-44">
              <select
                value={order}
                onChange={(event) =>
                  setOrder(
                    event.target.value as DefaultStorefrontProps["order"],
                  )
                }
                aria-label={t("Sort games")}
                className="h-11 w-full appearance-none rounded-lg border border-white/[0.1] bg-[#14101c] px-4 pr-10 text-sm font-semibold text-white/70 outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="newest">{t("Newest")}</option>
                <option value="oldest">{t("Oldest")}</option>
                <option value="price_asc">{t("Price: low to high")}</option>
                <option value="price_desc">{t("Price: high to low")}</option>
                <option value="title_asc">{t("Title A–Z")}</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35"
              />
            </div>
          </div>
        </div>

        <div
          data-storefront="filters"
          className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-2"
        >
          {categoryLinks.map(({ label, value }) => {
            const isActive = activeCategory === value;

            return (
              <Link
                key={label}
                href={browseHref({ category: value, page: 1 })}
                data-storefront="filter-option"
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-white bg-white text-black"
                    : "border-white/[0.09] bg-white/[0.025] text-white/50 hover:border-white/20 hover:text-white"
                }`}
              >
                {t(label)}
              </Link>
            );
          })}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[1.35] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.035]"
              />
            ))}
          </div>
        ) : games.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {games.map((game) => (
              <GameCard key={game.id} game={game} href={itemHref(game.slug)} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 py-16 text-center">
            <p className="font-semibold text-white/55">
              {t("No games found.")}
            </p>
            <Link
              href={browseHref({ q: "", category: null, tags: [], page: 1 })}
              className="mt-2 inline-flex text-sm font-bold text-violet-300 hover:text-violet-200"
            >
              {t("Clear filters")}
            </Link>
          </div>
        )}
      </section>

      {showDiscover && (
        <div id="outlets" className="scroll-mt-20 bg-[#0d0a13]">
          <DiscoverOutlets />
        </div>
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </main>
  );
}
