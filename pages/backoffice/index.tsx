import Head from "next/head";
import Link from "next/link";
import useSWR from "swr";
import {
  Loader2,
  Clock,
  TrendingUp,
  Users,
  Building2,
  Store as StoreIcon,
  Gamepad2,
} from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";

interface DashboardMetrics {
  games: {
    pending_count: number;
    oldest_pending: {
      id: string;
      slug: string;
      title: string;
      created_at: string;
    }[];
    by_status: { ACTIVE: number; INACTIVE: number; PRIVATE: number };
  };
  users: {
    total: number;
    signups_last_7_days: number;
    signups_previous_7_days: number;
  };
  studios: { total: number };
  stores: { total: number };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex items-center gap-4">
      <div
        className={`p-3 rounded-xl ${accent ?? "bg-white/10 text-white/60"}`}
      >
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wider text-white/40">
          {label}
        </div>
        <div className="text-2xl font-black text-white">{value}</div>
      </div>
    </div>
  );
}

export default function BackofficeIndexPage() {
  const { data, isLoading, error } = useSWR<DashboardMetrics>(
    "/api/v1/backoffice/dashboard",
    fetcher,
  );

  const signupsDelta = data
    ? data.users.signups_last_7_days - data.users.signups_previous_7_days
    : 0;

  return (
    <>
      <Head>
        <title>Backoffice | Manifold</title>
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-black">Dashboard</h1>

        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error || !data ? (
          <p className="text-rose-300 font-bold">Failed to load dashboard.</p>
        ) : (
          <>
            {/* What to check first thing in the morning: pending approvals and
                growth. Vanity totals go below, not up top. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard
                icon={Clock}
                label="Games Pending Approval"
                value={data.games.pending_count}
                accent="bg-amber-500/20 text-amber-300"
              />
              <StatCard
                icon={TrendingUp}
                label="Signups (Last 7 Days)"
                value={
                  <span className="flex items-baseline gap-2">
                    {data.users.signups_last_7_days}
                    <span
                      className={`text-sm font-bold ${
                        signupsDelta >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {signupsDelta >= 0 ? "+" : ""}
                      {signupsDelta} vs prior 7 days
                    </span>
                  </span>
                }
                accent="bg-emerald-500/20 text-emerald-300"
              />
            </div>

            {data.games.oldest_pending.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black">Oldest Pending Games</h2>
                  <Link
                    href="/backoffice/games"
                    className="text-sm font-bold text-white/50 hover:text-white transition-colors"
                  >
                    View review queue →
                  </Link>
                </div>
                <div className="rounded-2xl border border-white/10 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Title</th>
                        <th className="px-4 py-3 text-left">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.games.oldest_pending.map((game) => (
                        <tr key={game.id} className="border-t border-white/5">
                          <td className="px-4 py-3 font-bold text-white">
                            <Link
                              href={`/backoffice/games?q=${encodeURIComponent(game.title)}`}
                              className="hover:underline"
                            >
                              {game.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-white/40">
                            {new Date(game.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-black">Totals</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Users" value={data.users.total} />
                <StatCard
                  icon={Building2}
                  label="Studios"
                  value={data.studios.total}
                />
                <StatCard
                  icon={StoreIcon}
                  label="Stores"
                  value={data.stores.total}
                />
                <StatCard
                  icon={Gamepad2}
                  label="Active Games"
                  value={data.games.by_status.ACTIVE}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

BackofficeIndexPage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
