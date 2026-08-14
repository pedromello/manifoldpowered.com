import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useState } from "react";
import { Loader2, Building2, Copy, Check, Gamepad2 } from "lucide-react";
import { ReviewSummary } from "components/store/ReviewSummary";
import { type GameApi } from "components/store/types";
import { Pagination, type PaginationApi } from "components/Pagination";
import { formatMoney, formatPrice, isFree } from "lib/price";

interface Studio {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_publisher: boolean;
}

// No buyer field of any kind, matching the read:studio_sale filter branch. A
// studio is a supplier, not an affiliate, and has no use for telling one buyer
// from another — so the server does not send one to be typed here.
interface StudioSaleApi {
  id: string;
  game_id: string;
  game_title: string;
  game_slug: string | null;
  store_id: string | null;
  price_at_sale: string;
  currency: string;
  created_at: string;
}

type Tab = "games" | "sales";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/20 text-emerald-300",
  PRIVATE: "bg-amber-500/20 text-amber-300",
  INACTIVE: "bg-white/10 text-white/50",
};

export default function StudioPage() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;
  const [tab, setTab] = useState<Tab>("games");

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

            <div className="-mx-4 flex items-center gap-2 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["games", "Your Games"],
                  ["sales", "Sales"],
                ] as [Tab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={`shrink-0 px-4 py-3 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${
                    tab === value
                      ? "text-white border-white"
                      : "text-white/40 border-transparent hover:text-white/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "games" ? (
              <div className="flex flex-col gap-4">
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
            ) : (
              <StudioSalesTab studioSlug={studio.slug} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Sales of this studio's own games, resolved server-side through the catalogue
// since Sale carries no studio_id.
//
// 403 rather than 404 is the interesting failure here: the studio exists, the
// viewer just is not on it. Worth saying so plainly rather than showing an
// empty list, which would read as "no sales".
function StudioSalesTab({ studioSlug }: { studioSlug: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useSWR<{
    sales: StudioSaleApi[];
    pagination: PaginationApi;
  }>(
    `/api/v1/studios/${studioSlug}/sales?page=${page}`,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Failed to load sales.");
      }
      return response.json();
    },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-white/30" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-rose-300 font-bold text-sm">
        {error.message || "Failed to load sales."}
      </p>
    );
  }

  const sales = data?.sales ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-white/50 text-sm font-bold">
        {total} sale{total === 1 ? "" : "s"} of your games.
      </p>

      {sales.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 px-6 rounded-2xl border border-white/10 bg-white/5 text-center">
          <Gamepad2 size={32} className="text-white/20" />
          <p className="text-white/50 font-bold text-sm">No sales yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5"
              >
                {sale.game_slug ? (
                  <Link
                    href={`/item/${sale.game_slug}`}
                    className="min-w-0 flex-1 font-bold text-sm text-white truncate hover:underline"
                  >
                    {sale.game_title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 font-bold text-sm text-white truncate">
                    {sale.game_title}
                  </span>
                )}
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-black text-sm text-emerald-300">
                    {formatMoney(sale.price_at_sale, sale.currency)}
                  </span>
                  <span className="text-white/40 text-xs font-bold">
                    {new Date(sale.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Pagination pagination={data?.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function StudioGameCard({ game }: { game: GameApi }) {
  const [copied, setCopied] = useState(false);

  const isDemo = isFree(game);
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
          <span>{isDemo ? "Free" : formatPrice(game)}</span>
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
