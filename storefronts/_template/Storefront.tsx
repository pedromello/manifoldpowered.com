import Form from "next/form";
import Link from "next/link";

import type { StorefrontViewProps } from "components/storefront/types";
import { formatPrice, isFree } from "lib/price";
import { useI18n } from "lib/i18n";

/**
 * Starting point for a bespoke outlet storefront.
 *
 * Everything below is yours to throw away — the layout, the copy, the classes.
 * What must survive is the four `data-storefront` markers and the use of
 * `itemHref`, because those are what the contract guard checks and what keeps
 * an outlet's sales attributed to it.
 *
 * You never fetch here. `games`, `featured`, the filter state and the link
 * builders all arrive as props from `useStorefrontController`, already scoped
 * to this outlet's curated catalogue and the visitor's currency.
 *
 * Rules worth keeping:
 *   - Do not mirror `q`, `activeCategory` or `order` into `useState`. The URL
 *     is the source of truth, which is what makes a filtered view shareable
 *     and the back button correct.
 *   - Build every game link with `itemHref(game.slug)`. A hand-written
 *     `/item/${slug}` drops the `?store=` param and the sale stops paying out.
 *   - Handle `featured.length === 0` and `games.length === 0`. A newly curated
 *     outlet has both.
 *   - Put images in `public/storefronts/<slug>/`. `next/image` refuses hosts
 *     that are not in `remotePatterns` in next.config.js.
 */
export function TemplateStorefront({
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
}: StorefrontViewProps) {
  const { t } = useI18n();
  return (
    <main className="w-full pt-[calc(env(safe-area-inset-top)+7rem)] px-6 md:px-10 max-w-7xl mx-auto flex flex-col gap-10">
      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter">
            {store.name}
          </h1>
          {store.description && (
            <p className="text-sf-muted max-w-2xl text-lg">
              {store.description}
            </p>
          )}
        </div>
        {followControl}
      </header>

      {featured.length > 0 && (
        <section className="grid gap-4 md:grid-cols-3">
          {featured.slice(0, 3).map((game) => (
            <Link
              key={game.id}
              href={itemHref(game.slug)}
              data-storefront="game-link"
              className="rounded-3xl border border-sf-border bg-sf-surface p-6 min-h-40 flex flex-col justify-end"
            >
              <h2 className="text-2xl font-black">{game.title}</h2>
              {game.recommendation_reason && (
                <p className="line-clamp-2 text-sm text-sf-muted">
                  {game.recommendation_reason}
                </p>
              )}
              <span className="text-sf-accent font-black uppercase">
                {isFree(game) ? t("Free") : formatPrice(game)}
              </span>
            </Link>
          ))}
        </section>
      )}

      {/* Required: search. */}
      <Form action={searchAction} className="w-full md:w-96">
        <input
          type="text"
          name="q"
          data-storefront="search"
          defaultValue={q}
          placeholder={t("Search games...")}
          className="w-full rounded-2xl border border-sf-border bg-sf-surface px-5 py-4 text-sf-fg placeholder:text-sf-muted outline-none"
        />
        {activeCategory && (
          <input type="hidden" name="category" value={activeCategory} />
        )}
      </Form>

      {/* Required: filters. */}
      <nav data-storefront="filters" className="flex flex-wrap gap-3">
        {categories.map((category) => {
          const isActive =
            activeCategory === category ||
            (!activeCategory && category === "For You");
          return (
            <Link
              key={category}
              href={browseHref({
                category: category === "For You" ? null : category,
              })}
              className={`px-5 py-3 rounded-2xl font-bold ${
                isActive
                  ? "bg-sf-accent text-sf-accent-fg"
                  : "bg-sf-surface border border-sf-border text-sf-muted"
              }`}
            >
              {t(category)}
            </Link>
          );
        })}
      </nav>

      {/* Required: the catalogue. */}
      <section data-storefront="game-list" className="flex flex-col gap-4">
        {isLoading ? (
          <p className="py-20 text-center text-sf-muted font-bold">
            {t("Loading…")}
          </p>
        ) : games.length > 0 ? (
          games.map((game) => (
            <Link
              key={game.id}
              href={itemHref(game.slug)}
              data-storefront="game-link"
              className="flex items-center justify-between gap-6 rounded-3xl border border-sf-border bg-sf-surface p-6"
            >
              <div className="min-w-0">
                <h3 className="text-xl font-black truncate">{game.title}</h3>
                <p className="text-sf-muted text-sm truncate">
                  {(game.tags || []).join(", ")}
                </p>
              </div>
              <span className="text-sf-accent font-black uppercase shrink-0">
                {isFree(game) ? t("Free") : formatPrice(game)}
              </span>
            </Link>
          ))
        ) : (
          <p className="py-20 text-center text-sf-muted font-bold">
            {t("Nothing here yet.")}
          </p>
        )}
      </section>
    </main>
  );
}
