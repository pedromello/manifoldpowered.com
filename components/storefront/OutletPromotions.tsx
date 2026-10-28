import useSWR from "swr";
import Link from "next/link";
import { GameArtwork } from "components/store/GameArtwork";
import { GamePriceBlock } from "components/store/GamePriceBlock";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import type { GameApi } from "components/store/types";
import type { StorefrontViewProps } from "components/storefront/types";
import { useI18n } from "lib/i18n";
import { selectionRequest } from "lib/selection-client";

export function OutletPromotions({ props }: { props: StorefrontViewProps }) {
  const { t, locale } = useI18n();
  const { data, error } = useSWR<{ games: GameApi[] }>(
    `/api/v1/stores/${encodeURIComponent(props.store.slug)}/search?on_sale=1&limit=3&locale=${locale}${props.isPreview ? "&preview=1" : ""}`,
    selectionRequest,
  );
  if (error || !data?.games.length) return null;
  return (
    <section
      aria-label={t("On sale in this curation")}
      className="mx-auto max-w-[1380px] px-4 py-8 sm:px-8"
    >
      <h2 className="mb-6 text-3xl font-black">
        {t("On sale in this curation")}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {data.games.map((game) => (
          <Link
            key={game.id}
            href={props.itemHref(game.slug)}
            data-storefront="game-link"
            className="min-w-0 overflow-hidden rounded-2xl border border-sf-border bg-sf-surface focus-visible:outline-2 focus-visible:outline-sf-accent"
          >
            <GameArtwork
              src={game.media?.banner}
              className="aspect-video w-full"
            />
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="min-w-0 flex-1 break-words text-xl font-black">
                  {game.title}
                </h3>
                <OutletRatingBadge
                  rating={game.outlet_review?.rating}
                  variant="inline"
                />
              </div>
              <GamePriceBlock game={game} />
              <span className="flex min-h-11 items-center justify-center rounded-xl bg-sf-accent px-4 text-sm font-bold text-sf-accent-fg">
                {t("Discover the game")} →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
