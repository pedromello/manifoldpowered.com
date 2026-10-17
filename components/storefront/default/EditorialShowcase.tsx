import Link from "next/link";
import { ArrowRight, Quote } from "lucide-react";
import { GameArtwork } from "components/store/GameArtwork";
import { GameWishlistButton } from "components/store/GameWishlistButton";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import { useI18n } from "lib/i18n";
import { itemHref } from "lib/store-context";
import type { SelectionPageApi } from "lib/selection-client";

function Curator({ entry }: { entry: SelectionPageApi }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {entry.outlet.logo_url && (
        // Outlet imagery is hosted on creator-selected public URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.outlet.logo_url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      )}
      <div className="min-w-0">
        <Link
          href={`/store/${entry.outlet.slug}`}
          className="break-words text-sm font-bold hover:text-violet-200"
        >
          {entry.outlet.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
          {t("From the selection: {title}", { title: entry.selection.title })}
        </p>
      </div>
    </div>
  );
}

export function EditorialShowcase({
  selections,
}: {
  selections: SelectionPageApi[];
}) {
  const { t } = useI18n();
  const [hero, ...others] = selections
    .filter((entry) => entry.games.length)
    .slice(0, 3);
  if (!hero) return null;
  const game = hero.games[0];
  const reason = game.recommendation_reason || hero.selection.description;
  return (
    <div data-testid="editorial-showcase">
      <article className="grid overflow-hidden rounded-2xl border border-white/10 bg-[#171120] lg:grid-cols-[1.4fr_1fr]">
        <div className="relative min-h-[320px] sm:min-h-[420px]">
          <GameArtwork
            src={game.media?.banner || hero.selection.cover_url}
            loading="eager"
            fill
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <h2 className="max-w-xl break-words text-3xl font-black tracking-tight sm:text-5xl">
              {game.title}
            </h2>
            <div className="mt-3">
              <OutletRatingBadge rating={game.outlet_review?.rating} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={itemHref(game.slug, hero.outlet.slug)}
                data-storefront="game-link"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                {t("Discover the game")}{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <GameWishlistButton slug={game.slug} />
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-6 p-6 sm:p-8 xl:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200/75">
            {t("Why discover it")}
          </p>
          <blockquote className="flex gap-3">
            <Quote
              size={28}
              className="shrink-0 text-violet-400"
              aria-hidden="true"
            />
            <p className="line-clamp-6 break-words text-xl font-bold leading-relaxed sm:text-2xl">
              {reason}
            </p>
          </blockquote>
          <Curator entry={hero} />
          <Link
            href={hero.selection.public_path}
            className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-bold text-violet-300 hover:text-violet-200 focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {t("Explore selection")} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </article>
      {others.length > 0 && (
        <section className="mt-7" aria-label={t("Other ways to play")}>
          <h2 className="mb-4 text-xl font-black sm:text-2xl">
            {t("Other ways to play")}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {others.map((entry) => {
              const pick = entry.games[0];
              return (
                <article
                  key={entry.selection.id}
                  className="grid min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#171120] sm:grid-cols-[0.9fr_1.1fr]"
                >
                  <GameArtwork
                    src={pick.media?.banner || entry.selection.cover_url}
                    className="aspect-[16/10] sm:aspect-auto sm:min-h-64"
                  />
                  <div className="flex min-w-0 flex-col gap-4 p-5">
                    <h3 className="break-words text-xl font-black">
                      {pick.title}
                    </h3>
                    <p className="line-clamp-2 text-sm leading-6 text-white/65">
                      {pick.recommendation_reason ||
                        entry.selection.description}
                    </p>
                    <Curator entry={entry} />
                    <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
                      <Link
                        href={itemHref(pick.slug, entry.outlet.slug)}
                        data-storefront="game-link"
                        className="inline-flex min-h-11 items-center gap-1 text-white"
                      >
                        {t("Discover the game")}{" "}
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                      <Link
                        href={entry.selection.public_path}
                        className="inline-flex min-h-11 items-center text-violet-300"
                      >
                        {t("View selection")}{" "}
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
