import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useState } from "react";
import { Loader2, Building2, Copy, Check, Gamepad2 } from "lucide-react";
import { ReviewSummary } from "components/store/ReviewSummary";
import { type GameApi } from "components/store/GameListItem";

interface Studio {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_publisher: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/20 text-emerald-300",
  PRIVATE: "bg-amber-500/20 text-amber-300",
  INACTIVE: "bg-white/10 text-white/50",
};

export default function StudioPage() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;

  const {
    data: studio,
    isLoading,
    error,
  } = useSWR<Studio>(slug ? `/api/v1/studios/${slug}` : null, fetcher);

  const { data: gamesData, isLoading: isLoadingGames } = useSWR<{
    games: GameApi[];
  }>(studio ? `/api/v1/studios/${studio.slug}/games` : null, fetcher);

  const games = gamesData?.games ?? [];

  return (
    <>
      <Head>
        <title>
          {studio ? `${studio.name} | Manifold` : "Studio | Manifold"}
        </title>
      </Head>

      <div className="min-h-screen bg-[#1D0F3B] text-white px-4 py-12">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin text-white/30" />
          </div>
        ) : error || !studio ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-rose-300 font-bold">Studio not found.</p>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {studio.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={studio.logo_url}
                  alt={`${studio.name} logo`}
                  className="w-16 h-16 shrink-0 rounded-2xl object-cover border border-white/10 bg-white/5"
                />
              ) : (
                <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 text-white/30">
                  <Building2 size={28} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black break-words">
                  {studio.name}
                </h1>
                {studio.is_publisher && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-lg bg-white/10 text-white/60 text-xs font-black uppercase tracking-wider">
                    Publisher
                  </span>
                )}
              </div>

              <Link
                href={`/studio/${studio.slug}/games/steam-import`}
                className="shrink-0 px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider text-center hover:bg-emerald-400 transition-colors"
              >
                Import from Steam
              </Link>
            </div>

            {studio.description && (
              <p className="text-white/70 text-sm leading-relaxed">
                {studio.description}
              </p>
            )}

            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-black uppercase tracking-wider text-white/80">
                Your Games
              </h2>

              {isLoadingGames ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-white/30" />
                </div>
              ) : games.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 px-6 rounded-2xl border border-white/10 bg-white/5 text-center">
                  <Gamepad2 size={32} className="text-white/20" />
                  <p className="text-white/50 font-bold text-sm">
                    No games yet.
                  </p>
                  <Link
                    href={`/studio/${studio.slug}/games/steam-import`}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors"
                  >
                    Import a Game from Steam
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {games.map((game) => (
                    <StudioGameCard key={game.id} game={game} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StudioGameCard({ game }: { game: GameApi }) {
  const [copied, setCopied] = useState(false);

  const isDemo = !game.price || Number(game.price) === 0;
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  const launchDate = new Date(game.launch_date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  async function handleCopyLink() {
    const url = `${window.location.origin}/item/${game.slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div
        className="aspect-[16/9] w-full"
        style={{
          background: game.media.banner
            ? `url(${game.media.banner}) center/cover no-repeat`
            : defaultGradient,
        }}
      />

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-black text-white truncate">{game.title}</h3>
          {game.status && (
            <span
              className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                STATUS_STYLES[game.status] ?? STATUS_STYLES.INACTIVE
              }`}
            >
              {game.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-white/40 font-bold">
          <span>{isDemo ? "Free" : `$${game.price}`}</span>
          <span className="text-white/20">•</span>
          <span>{launchDate}</span>
        </div>

        <ReviewSummary
          positive={game.positive_reviews ?? 0}
          negative={game.negative_reviews ?? 0}
          reviewScore={game.review_score ?? null}
        />

        <button
          onClick={handleCopyLink}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-black uppercase tracking-wider transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-400" />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
