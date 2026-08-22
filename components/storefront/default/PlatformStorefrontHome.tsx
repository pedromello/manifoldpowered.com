import Form from "next/form";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, Search, X } from "lucide-react";

import { DiscoverOutlets } from "components/store/DiscoverOutlets";
import type { GameApi } from "components/store/types";
import type { DefaultStorefrontProps } from "components/storefront/types";
import { formatBasePrice, formatPrice, isFree } from "lib/price";

function Price({ game, large = false }: { game: GameApi; large?: boolean }) {
  const basePrice = formatBasePrice(game);

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
        {isFree(game) ? "Free" : formatPrice(game)}
      </span>
    </div>
  );
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

function Spotlight({ game, itemHref }: { game: GameApi; itemHref: string }) {
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
            alt={`${game.title} banner`}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#28183b,#15101d)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5 md:bg-gradient-to-r md:from-transparent md:to-black/20" />
      </Link>

      <div className="flex flex-col justify-center p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
          Now on Manifold
        </p>
        <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-0.025em] text-white sm:text-4xl">
          {game.title}
        </h2>
        <p className="mt-2 text-sm font-semibold text-white/45">
          by {game.developer_name}
        </p>
        {game.description && (
          <p className="mt-5 line-clamp-3 text-sm leading-6 text-white/60">
            {game.description}
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
            View game
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function GameCard({ game, href }: { game: GameApi; href: string }) {
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
        {game.discount_label && formatBasePrice(game) && (
          <span className="absolute bottom-2 left-2 rounded-md bg-emerald-400 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-950">
            {game.discount_label}
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

  if (!visible) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-violet-400/20 bg-violet-400/[0.06] px-4 py-3 text-sm text-violet-100/75">
      <Check size={17} className="mt-0.5 shrink-0 text-violet-300" />
      <p className="flex-1 leading-5">
        Manifold is in preview. You can explore games and Outlets while we
        finish the purchasing experience.
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss preview notice"
        className="rounded p-0.5 text-white/35 hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function PlatformStorefrontHome({
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
  const spotlight = featured[0] ?? games[0];
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

        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="max-w-2xl text-2xl font-black tracking-[-0.02em] sm:text-3xl">
              Think Steam, but with creator-run storefronts.
            </h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/45 sm:text-right">
            Buy games in one library while independent Outlets can earn
            commission on the sales they refer.
          </p>
        </div>

        {isFeaturedLoading && !spotlight ? (
          <HeroSkeleton />
        ) : spotlight ? (
          <Spotlight game={spotlight} itemHref={itemHref(spotlight.slug)} />
        ) : (
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-6 text-center text-white/40">
            The first games are being prepared for the catalog.
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
              Shared catalog
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.025em]">
              Explore games
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
                placeholder="Search the catalog"
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
                aria-label="Sort games"
                className="h-11 w-full appearance-none rounded-lg border border-white/[0.1] bg-[#14101c] px-4 pr-10 text-sm font-semibold text-white/70 outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="title_asc">Title A–Z</option>
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
                {label}
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
            <p className="font-semibold text-white/55">No games found.</p>
            <Link
              href={browseHref({ q: "", category: null, tags: [], page: 1 })}
              className="mt-2 inline-flex text-sm font-bold text-violet-300 hover:text-violet-200"
            >
              Clear filters
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
