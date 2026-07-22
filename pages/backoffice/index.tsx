import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  Loader2,
  Clock,
  TrendingUp,
  Users,
  Building2,
  Store as StoreIcon,
  Gamepad2,
  Wrench,
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

interface PassResult {
  scanned: number;
  updated: number;
  skipped_ineligible: number;
}

interface BackfillReport {
  baseline: PassResult;
  studio_owners: PassResult;
  studio_members: PassResult;
  store_owners: PassResult;
  store_members: PassResult;
  total_unique_users_updated: number;
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

  const [isReconciling, setIsReconciling] = useState(false);
  const [backfillReport, setBackfillReport] = useState<BackfillReport | null>(
    null,
  );
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const signupsDelta = data
    ? data.users.signups_last_7_days - data.users.signups_previous_7_days
    : 0;

  async function runFeatureBackfill() {
    const confirmed = window.confirm(
      "Reconcile feature grants for all activated users, studio owners/members, and store owners/members against current permission definitions? Only adds missing features — never removes any.",
    );
    if (!confirmed) return;

    setIsReconciling(true);
    setBackfillError(null);
    setBackfillReport(null);

    const response = await fetch("/api/v1/backoffice/feature-backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setBackfillError(body?.message || "Failed to reconcile features.");
      setIsReconciling(false);
      return;
    }

    setBackfillReport(await response.json());
    setIsReconciling(false);
  }

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

            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-black">Maintenance</h2>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-white/10 text-white/60">
                      <Wrench size={20} />
                    </div>
                    <div>
                      <div className="font-black text-white">
                        Reconcile Feature Grants
                      </div>
                      <div className="text-sm text-white/50 font-bold">
                        Grants users any feature they&apos;re missing from the
                        current baseline/studio/store permission definitions.
                        Safe to re-run any time.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={runFeatureBackfill}
                    disabled={isReconciling}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black font-black uppercase text-xs tracking-wider hover:bg-white/90 transition-colors disabled:opacity-50"
                  >
                    {isReconciling ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Wrench size={14} />
                    )}
                    {isReconciling ? "Reconciling..." : "Run Now"}
                  </button>
                </div>

                {backfillError && (
                  <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
                    {backfillError}
                  </div>
                )}

                {backfillReport && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard
                      label="Users Updated"
                      icon={Users}
                      value={backfillReport.total_unique_users_updated}
                      accent="bg-emerald-500/20 text-emerald-300"
                    />
                    <StatCard
                      label="Baseline Updated"
                      icon={Users}
                      value={backfillReport.baseline.updated}
                    />
                    <StatCard
                      label="Studio Owners Updated"
                      icon={Building2}
                      value={backfillReport.studio_owners.updated}
                    />
                    <StatCard
                      label="Studio Members Updated"
                      icon={Building2}
                      value={backfillReport.studio_members.updated}
                    />
                    <StatCard
                      label="Store Owners Updated"
                      icon={StoreIcon}
                      value={backfillReport.store_owners.updated}
                    />
                    <StatCard
                      label="Store Members Updated"
                      icon={StoreIcon}
                      value={backfillReport.store_members.updated}
                    />
                  </div>
                )}
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
