import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import { useI18n } from "lib/i18n";

interface BackofficeStudio {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_publisher: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface BackofficeGame {
  id: string;
  slug: string;
  title: string;
  status: "ACTIVE" | "ONLY_DISPLAY" | "INACTIVE" | "PRIVATE";
  created_at: string;
}

interface StudioDetailResponse {
  studio: BackofficeStudio;
  games: BackofficeGame[];
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not found");
    return res.json();
  });

export default function BackofficeStudioDetailPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { slug } = router.query;

  const key = slug ? `/api/v1/backoffice/studios/${slug}` : null;
  const { data, isLoading, error } = useSWR<StudioDetailResponse>(key, fetcher);

  const studio = data?.studio;
  const games = data?.games ?? [];

  return (
    <>
      <Head>
        <title>
          {studio
            ? t("{name} | Manifold Admin", { name: studio.name })
            : t("Studio | Manifold Admin")}
        </title>
      </Head>

      <div className="flex flex-col gap-6 max-w-3xl">
        <Link
          href="/backoffice/studios"
          className="flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          {t("Back to Studios")}
        </Link>

        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error || !studio ? (
          <p className="text-rose-300 font-bold">{t("Studio not found.")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black">{studio.name}</h1>
                  {studio.description && (
                    <p className="text-white/50 font-bold mt-1">
                      {studio.description}
                    </p>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                    studio.is_publisher
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "bg-white/10 text-white/50"
                  }`}
                >
                  {studio.is_publisher ? t("Publisher") : t("Developer")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                    {t("Studio ID")}
                  </div>
                  <div className="text-white/70 font-mono text-xs break-all">
                    {studio.id}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                    {t("Created")}
                  </div>
                  <div className="text-white/70 font-bold">
                    {new Date(studio.created_at).toLocaleString(locale)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-black">
                {t("Games ({count})", { count: games.length })}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">{t("Title")}</th>
                      <th className="px-4 py-3 text-left">{t("Status")}</th>
                      <th className="px-4 py-3 text-left">{t("Submitted")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-white/40 font-bold"
                        >
                          {t("No games yet.")}
                        </td>
                      </tr>
                    ) : (
                      games.map((game) => (
                        <tr key={game.id} className="border-t border-white/5">
                          <td className="px-4 py-3 font-bold text-white">
                            <Link
                              href={`/backoffice/games?q=${encodeURIComponent(game.title)}`}
                              className="hover:underline"
                            >
                              {game.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                game.status === "ACTIVE"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : game.status === "PRIVATE"
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-white/10 text-white/50"
                              }`}
                            >
                              {t(game.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/40">
                            {new Date(game.created_at).toLocaleDateString(
                              locale,
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

BackofficeStudioDetailPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
