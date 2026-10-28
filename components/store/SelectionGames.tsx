import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { GameArtwork } from "components/store/GameArtwork";
import { GamePriceBlock } from "components/store/GamePriceBlock";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import type { GameApi } from "components/store/types";
import { itemHref } from "lib/store-context";
import { catalogOffer } from "lib/catalog-offer";
import { useI18n } from "lib/i18n";

export function SelectionGames({
  games,
  outletSlug,
  preview = false,
}: {
  games: GameApi[];
  outletSlug: string;
  preview?: boolean;
}) {
  const { t } = useI18n();
  const [onSale, setOnSale] = useState(false);
  const displayed = onSale
    ? games.filter((game) => catalogOffer(game).discount_percent !== null)
    : games;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-black">
          {t("{count} games in this selection", { count: games.length })}
        </h2>
        <div role="group" aria-label={t("Filter games")} className="flex gap-2">
          {[false, true].map((sale) => (
            <button
              key={String(sale)}
              type="button"
              aria-pressed={onSale === sale}
              onClick={() => setOnSale(sale)}
              className={`min-h-11 rounded-full border border-sf-border px-5 text-sm font-bold ${onSale === sale ? "bg-sf-accent text-sf-accent-fg" : "bg-sf-surface text-sf-fg"}`}
            >
              {t(sale ? "On sale" : "All games")}
            </button>
          ))}
        </div>
      </div>
      {!displayed.length && (
        <p
          role="status"
          className="rounded-xl border border-sf-border p-5 text-sf-muted"
        >
          {t("No games on sale in this selection.")}
        </p>
      )}
      <ol className="grid gap-4">
        {displayed.map((game) => (
          <li key={game.id} className="min-w-0">
            <Link
              href={itemHref(game.slug, outletSlug, preview)}
              data-storefront="game-link"
              className="group grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl border border-sf-border bg-sf-surface p-3 focus-visible:outline-2 focus-visible:outline-sf-accent sm:grid-cols-[minmax(140px,0.8fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:p-0 sm:pr-5"
            >
              <GameArtwork
                src={game.media?.banner}
                className="aspect-[16/10] w-full self-start rounded-lg sm:aspect-video sm:rounded-none"
              />
              <div className="min-w-0 sm:py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="min-w-0 flex-1 break-words text-base font-black sm:text-xl">
                    {game.title}
                  </h3>
                  <OutletRatingBadge
                    rating={game.outlet_review?.rating}
                    variant="inline"
                  />
                </div>
                <p className="mt-2 hidden break-words text-sm leading-6 text-sf-muted sm:line-clamp-2">
                  {game.outlet_review?.headline || game.description}
                </p>
                <span className="mt-2 hidden min-h-11 items-center gap-2 text-sm font-bold text-sf-accent sm:inline-flex">
                  {t("Discover the game")}{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
              <div className="col-span-2 min-w-0 border-t border-sf-border pt-3 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <GamePriceBlock game={game} />
                <span className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-sf-accent sm:hidden">
                  {t("Discover the game")}{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
