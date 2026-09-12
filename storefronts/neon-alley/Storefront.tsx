import Form from "next/form";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import { OutletRatingFilter } from "components/storefront/OutletRatingFilter";
import { Pagination } from "components/Pagination";
import Link from "next/link";

import { useStorefrontTrending } from "components/storefront/useStorefrontExtras";
import type { StorefrontViewProps } from "components/storefront/types";
import type { GameApi } from "components/store/types";
import { GameArtwork } from "components/store/GameArtwork";
import {
  formatCatalogBasePrice,
  formatCatalogPrice,
  isCatalogFree,
} from "lib/price";
import { useI18n } from "lib/i18n";

/**
 * Neon Alley — the pilot bespoke storefront.
 *
 * Structurally unlike the default on purpose: a full-bleed marquee instead of
 * the 1+2 bento, a persistent left rail instead of horizontal pills, and a card
 * grid instead of list rows. The point of the pilot is to prove those choices
 * are possible without touching anything shared.
 *
 * Every piece of data here arrives as props. The only extra request is the
 * trending rail, which is opt-in via its own hook.
 */

function Price({ game }: { game: GameApi }) {
  const { t } = useI18n();
  const free = isCatalogFree(game);
  const was = formatCatalogBasePrice(game);

  return (
    <span className="flex items-baseline gap-2">
      <span className="text-sf-accent font-black uppercase tracking-tight">
        {free ? t("Free") : formatCatalogPrice(game)}
      </span>
      {!free && was && (
        <span className="text-sf-muted text-xs line-through">{was}</span>
      )}
    </span>
  );
}

function Tile({
  game,
  href,
  large,
}: {
  game: GameApi;
  href: string;
  large?: boolean;
}) {
  return (
    <Link
      href={href}
      data-storefront="game-link"
      className={`group grid h-full min-w-0 overflow-hidden border border-sf-border bg-sf-surface transition-colors duration-300 hover:border-sf-accent ${
        large
          ? "min-h-[22rem] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
          : "min-h-[13rem]"
      }`}
      style={{ clipPath: "polygon(0 0, 100% 0, 100% 88%, 94% 100%, 0 100%)" }}
    >
      <GameArtwork
        src={game.media?.banner}
        loading={large ? "eager" : "lazy"}
        className={`aspect-[16/9] w-full ${large ? "md:aspect-auto" : ""}`}
      />

      <div className="flex min-w-0 flex-col justify-center gap-2 bg-sf-surface p-5">
        <h3
          className={`font-black uppercase leading-none tracking-tight ${
            large ? "text-3xl" : "text-xl"
          }`}
        >
          {game.title}
        </h3>
        <OutletRatingBadge rating={game.outlet_review?.rating} />
        {game.recommendation_reason && (
          <p className="line-clamp-2 text-sm font-semibold leading-relaxed text-sf-fg/80">
            {game.recommendation_reason}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Price game={game} />
          <span className="text-[10px] uppercase tracking-[0.25em] text-sf-muted truncate">
            {(game.tags || []).slice(0, 2).join(" / ")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function NeonAlleyStorefront({
  store,
  followControl,
  featured,
  games,
  isLoading,
  q,
  activeCategory,
  categories,
  itemHref,
  browseHref,
  searchAction,
  searchHiddenFields,
  ratingFilter,
  setRatingFilter,
  pagination,
  setPage,
}: StorefrontViewProps) {
  const { t } = useI18n();
  const trending = useStorefrontTrending(store.slug, 4);
  const [marquee, ...rest] = featured;

  return (
    <main className="w-full pt-[calc(env(safe-area-inset-top)+6rem)]">
      {/* Marquee */}
      <section className="relative w-full px-5 md:px-10">
        <div className="max-w-7xl mx-auto">
          {/* The outlet name is the page's h1 even though it is styled as a
              rule-and-label. Every storefront needs one top-level heading. */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-px flex-1 bg-sf-border" />
              <h1 className="truncate text-[10px] font-black uppercase tracking-[0.5em] text-sf-accent md:text-xs">
                {store.name}
              </h1>
              <span className="h-px flex-1 bg-sf-border" />
            </div>
            {followControl}
          </div>

          {marquee ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Tile game={marquee} href={itemHref(marquee.slug)} large />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {rest.slice(0, 2).map((game) => (
                  <Tile key={game.id} game={game} href={itemHref(game.slug)} />
                ))}
              </div>
            </div>
          ) : (
            <p className="border border-sf-border bg-sf-surface p-10 text-center text-sf-muted font-bold uppercase tracking-widest">
              {t("The shelf is still being stocked.")}
            </p>
          )}

          {(store.presentation?.tagline || store.description) && (
            <p className="mt-6 max-w-2xl text-sf-muted text-base md:text-lg">
              {store.presentation?.tagline || store.description}
            </p>
          )}
        </div>
      </section>

      {/* Rail + catalogue */}
      <section className="max-w-7xl mx-auto px-5 md:px-10 py-14 flex flex-col lg:flex-row gap-10">
        <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
          <Form action={searchAction} className="flex flex-col gap-2">
            {Object.entries(searchHiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <label
              htmlFor="neon-search"
              className="text-[10px] uppercase tracking-[0.35em] text-sf-accent font-black"
            >
              {t("Find")}
            </label>
            <input
              id="neon-search"
              type="text"
              name="q"
              data-storefront="search"
              defaultValue={q}
              placeholder={t("Search the alley")}
              className="w-full bg-transparent border-b-2 border-sf-border focus:border-sf-accent px-1 py-3 text-sf-fg placeholder:text-sf-muted outline-none transition-colors font-bold"
            />
          </Form>

          <OutletRatingFilter
            scale={store.rating_scale ?? null}
            filter={ratingFilter}
            onChange={setRatingFilter}
          />
          <nav data-storefront="filters" className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.35em] text-sf-accent font-black mb-3">
              {t("Channels")}
            </span>
            {categories.map((category) => {
              const isActive =
                activeCategory === category ||
                (!activeCategory && category === "For You");
              return (
                <Link
                  key={category}
                  href={browseHref({
                    category: category === "For You" ? null : category,
                    page: 1,
                  })}
                  className={`py-2 font-black uppercase tracking-wide text-sm border-l-2 pl-3 transition-all ${
                    isActive
                      ? "border-sf-accent text-sf-accent"
                      : "border-transparent text-sf-muted hover:text-sf-fg hover:border-sf-border"
                  }`}
                >
                  {t(category)}
                </Link>
              );
            })}
          </nav>

          {trending.games.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] uppercase tracking-[0.35em] text-sf-accent font-black">
                {t("Hot right now")}
              </span>
              {trending.games.map((game) => (
                <Link
                  key={game.id}
                  href={itemHref(game.slug)}
                  data-storefront="game-link"
                  className="flex items-center justify-between gap-3 text-sm font-bold text-sf-muted hover:text-sf-fg transition-colors"
                >
                  <span className="truncate">{game.title}</span>
                  <span className="text-sf-accent shrink-0 text-xs">
                    {isCatalogFree(game) ? t("Free") : formatCatalogPrice(game)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </aside>

        <div
          data-storefront="game-list"
          className="flex-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 auto-rows-min"
        >
          {isLoading ? (
            <p className="col-span-full py-24 text-center text-sf-muted font-black uppercase tracking-[0.3em]">
              {t("Loading…")}
            </p>
          ) : games.length > 0 ? (
            games.map((game) => (
              <Tile key={game.id} game={game} href={itemHref(game.slug)} />
            ))
          ) : (
            <p className="col-span-full py-24 text-center text-sf-muted font-black uppercase tracking-[0.3em]">
              {t("Nothing on this channel")}
            </p>
          )}
          <div className="col-span-full">
            <Pagination pagination={pagination} onPageChange={setPage} />
          </div>
        </div>
      </section>
    </main>
  );
}
