import Link from "next/link";
import Image from "next/image";
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
    <section className="relative w-full max-h-[700px] overflow-hidden">
      <div className="absolute inset-0">
        {game.media.banner && (
          <Image
            src={game.media.banner}
            alt={game.title}
            fill
            className="object-cover opacity-40 blur-sm"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1D0F3B] via-[#1D0F3B]/60 to-transparent" />
      </div>

      <div className="relative h-full max-w-7xl mx-auto px-6 md:px-10 flex flex-col justify-end pb-12">
        <div className="flex flex-col items-start gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <Link
            href={backHref}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition-all group"
          >
            <ArrowLeft
              size={16}
              className="group-hover:-translate-x-1 transition-transform"
            />
            {backLabel}
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            {game.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-md text-[10px] md:text-xs font-black tracking-widest uppercase border border-white/10 text-white/90"
              >
                {tag}
              </span>
            ))}
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter leading-none text-white drop-shadow-2xl">
            {game.title}
          </h1>

          <p className="max-w-2xl text-lg md:text-2xl font-medium text-white/80 leading-relaxed drop-shadow-md">
            {game.description}
          </p>

          <ReviewSummary
            positive={game.positive_reviews}
            negative={game.negative_reviews}
            reviewScore={game.review_score}
          />
        </div>
      </div>
    </section>
  );
}
