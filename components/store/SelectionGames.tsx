import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GameArtwork } from "components/store/GameArtwork";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import type { GameApi } from "components/store/types";
import { itemHref } from "lib/store-context";
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
  return (
    <ol className="grid gap-5 sm:grid-cols-2">
      {games.map((game, index) => (
        <li key={game.id} className="min-w-0">
          <Link
            href={itemHref(game.slug, outletSlug, preview)}
            data-storefront="game-link"
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171120] focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <div className="relative">
              <GameArtwork src={game.media?.banner} className="aspect-[16/9]" />
              <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-sm font-bold">
                {index + 1}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5">
              <h3 className="break-words text-xl font-black group-hover:text-violet-200">
                {game.title}
              </h3>
              <OutletRatingBadge rating={game.outlet_review?.rating} />
              <p className="line-clamp-3 break-words text-sm leading-6 text-white/60">
                {game.outlet_review?.headline || game.description}
              </p>
              <span className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-bold text-violet-300">
                {t("Discover the game")}{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
