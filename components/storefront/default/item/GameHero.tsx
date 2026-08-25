import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ReviewSummary } from "components/store/ReviewSummary";
import type { GameDetailApi } from "components/store/types";

export function GameHero({
  game,
  backHref,
  backLabel,
}: {
  game: GameDetailApi;
  backHref: string;
  backLabel: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)]">
        <div className="flex min-w-0 flex-col items-start gap-5">
          <Link
            href={backHref}
            className="group flex items-center gap-2 text-sm font-semibold text-white/50 transition-colors hover:text-white"
          >
            <ArrowLeft
              size={16}
              className="transition-transform group-hover:-translate-x-0.5"
            />
            {backLabel}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {game.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55"
              >
                {tag}
              </span>
            ))}
            {game.tags.length > 5 && (
              <span className="px-1 text-[11px] font-semibold text-white/35">
                +{game.tags.length - 5} more
              </span>
            )}
          </div>

          <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
            {game.title}
          </h1>

          <p className="max-w-2xl text-base font-medium leading-7 text-white/58 sm:text-lg">
            {game.description}
          </p>

          <ReviewSummary
            positive={game.positive_reviews}
            negative={game.negative_reviews}
            reviewScore={game.review_score}
          />
        </div>

        {game.media.banner && (
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-[#14101c]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={game.media.banner}
              alt={`${game.title} cover`}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04]" />
          </div>
        )}
      </div>
    </section>
  );
}
