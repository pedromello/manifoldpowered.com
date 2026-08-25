import Head from "next/head";
import { useState } from "react";
import useSWR from "swr";
import {
  Loader2,
  Banknote,
  Package,
  Store as StoreIcon,
  TrendingUp,
  Send,
} from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import { formatMoney } from "lib/price";

interface RevenueRow {
  currency: string;
  gross: string;
  supplier_cost: string;
  affiliate_commission: string;
  platform_revenue: string;
  payouts: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const RANGES = [
  ["all", "All time"],
  ["30", "Last 30 days"],
  ["7", "Last 7 days"],
] as const;

type Range = (typeof RANGES)[number][0];

const ONE_DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;

// Module scope on purpose. This reads the clock, so calling it while rendering
// would give the SWR key a different value on every render and refetch in a
// loop — react-hooks/purity refuses it inside the component for exactly that
// reason. It is only ever called from the range buttons' click handler, which
// also gives the better behaviour: the window holds still while you read the
// report rather than sliding forward underneath you.
function boundaryFor(range: Range): string | null {
  if (range === "all") {
    return null;
  }

  return new Date(
    Date.now() - Number(range) * ONE_DAY_IN_MILLISECONDS,
  ).toISOString();
}

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
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
      <div
        className={`p-3 rounded-xl shrink-0 ${accent ?? "bg-white/10 text-white/60"}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-black uppercase tracking-wider text-white/40">
          {label}
        </div>
        <div className="text-2xl font-black text-white break-all">{value}</div>
      </div>
    </div>
  );
}

// The platform's own income statement.
//
// One block per currency and never a combined figure: a BRL book and a USD book
// are not addable, and the API returns them as separate rows for that reason.
// Amounts arrive at the ledger's 4-decimal scale and are rendered untouched —
// platform revenue is a residual, so rounding it for display is exactly what
// would stop the columns adding up.
export default function BackofficeRevenuePage() {
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState<string | null>(null);

  function selectRange(value: Range) {
    setRange(value);
    setFrom(boundaryFor(value));
  }

  const { data, isLoading, error } = useSWR<{ revenue: RevenueRow[] }>(
    from
      ? `/api/v1/backoffice/revenue?from=${encodeURIComponent(from)}`
      : "/api/v1/backoffice/revenue",
    fetcher,
  );

  const revenue = data?.revenue ?? [];

  return (
    <>
      <Head>
        <title>Revenue | Manifold</title>
        <meta name="theme-color" content="#0b0812" />
      </Head>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">Revenue</h1>
            <p className="text-white/50 text-sm font-bold mt-1">
              Every money movement the ledger recorded, grouped by currency.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
            {RANGES.map(([value, label]) => (
              <button
                key={value}
                onClick={() => selectRange(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                  range === value
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error ? (
          <p className="text-rose-300 font-bold">Failed to load revenue.</p>
        ) : revenue.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-6 py-16 text-center">
            <p className="text-white/40 font-bold">
              No ledger entries in this range.
            </p>
          </div>
        ) : (
          revenue.map((row) => (
            <div key={row.currency} className="flex flex-col gap-3">
              <h2 className="text-xl font-black">{row.currency}</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard
                  icon={Banknote}
                  label="Gross collected"
                  value={formatMoney(row.gross, row.currency)}
                  accent="bg-indigo-500/20 text-indigo-300"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Platform revenue"
                  value={formatMoney(row.platform_revenue, row.currency)}
                  accent="bg-emerald-500/20 text-emerald-300"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  icon={Package}
                  label="Supplier cost"
                  value={formatMoney(row.supplier_cost, row.currency)}
                />
                <StatCard
                  icon={StoreIcon}
                  label="Affiliate commission"
                  value={formatMoney(row.affiliate_commission, row.currency)}
                />
                <StatCard
                  icon={Send}
                  label="Paid out"
                  value={formatMoney(row.payouts, row.currency)}
                />
              </div>
            </div>
          ))
        )}

        <p className="text-white/30 text-xs font-bold max-w-2xl">
          Supplier cost, commission and platform revenue are the three ways the
          gross was distributed, so they add back up to it. Commission is
          counted when it is earned, whether or not it has cleared its hold —
          paid out is a separate line, and subtracting it here would count the
          same money twice.
        </p>
      </div>
    </>
  );
}

BackofficeRevenuePage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
