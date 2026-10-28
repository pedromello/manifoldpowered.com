import Head from "next/head";
import { useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";

type Report = {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  last_error: string | null;
};
type Summary = {
  recent_orders?: {
    id: string;
    fulfillment_status: string;
    last_error: string | null;
    next_tracking_at: string | null;
  }[];
  products: {
    id: string;
    code: string;
    name: string;
    amount_minor: number;
    currency: string;
    enabled: boolean;
    available: boolean;
  }[];
  last_sync_at: string | null;
  last_error: string | null;
  payment_jobs: number;
  submission_jobs: number;
  tracking_jobs: number;
  review_orders: number;
};
const actions = [
  {
    action: "sync-catalog",
    label: "Sync catalog",
    description: "Import the current gift card catalog.",
  },
  {
    action: "reconcile-payments",
    label: "Reconcile payments",
    description: "Verify pending payments with the payment service.",
  },
  {
    action: "submit-paid-orders",
    label: "Send paid orders",
    description: "Submit paid gift cards for delivery by email.",
  },
  {
    action: "track-deliveries",
    label: "Track deliveries",
    description: "Check deliveries that are due for an update.",
  },
] as const;

export default function GiftCardOperationsPage({
  manualTracking = false,
}: {
  manualTracking?: boolean;
}) {
  const { t, locale, translateError } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<Summary>(
    "/api/v1/backoffice/gift-cards",
    async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok)
        throw new Error("Gift card operations are unavailable.");
      return response.json();
    },
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [report, setReport] = useState<{
    label: string;
    result: Report;
  } | null>(null);
  const [orderId, setOrderId] = useState("");

  async function run(
    action: string,
    body: Record<string, unknown> = {},
    label = "Operation completed",
  ) {
    if (busy) return;
    setBusy(action);
    setFailure(null);
    setReport(null);
    try {
      const response = await fetch(`/api/v1/backoffice/gift-cards/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message || "The operation could not be completed.",
        );
      if (action !== "products") setReport({ label, result });
      await mutate();
    } catch (cause) {
      setFailure(
        translateError(
          cause instanceof Error ? cause.message : undefined,
          "The operation could not be completed.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Gift cards")} | Manifold Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div className="space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">{t("Gift cards")}</h1>
            <p className="mt-2 text-sm text-white/55">
              {t("Manage the catalog and email delivery of gift card orders.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={!!busy}
            className="rounded-lg border border-white/15 p-3 disabled:opacity-50"
            aria-label={t("Refresh")}
          >
            <RefreshCw size={17} />
          </button>
        </header>
        {isLoading && <p className="text-white/55">{t("Loading...")}</p>}
        {error && (
          <p role="alert" className="text-rose-300">
            {t("Gift card operations are unavailable.")}
          </p>
        )}
        {failure && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200"
          >
            {failure}
          </p>
        )}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Pending payments", data.payment_jobs],
                ["Orders to send", data.submission_jobs],
                ["Deliveries to track", data.tracking_jobs],
                ["Orders requiring review", data.review_orders],
              ].map(([label, count]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <p className="text-xs text-white/50">{t(String(label))}</p>
                  <p className="mt-2 text-2xl font-black">{count}</p>
                </div>
              ))}
            </div>
            <section className="space-y-4">
              <h2 className="text-xl font-black">{t("Operations")}</h2>
              <p className="text-sm text-white/50">
                {t(
                  "Each action processes a limited batch. Run it again if work remains. Deliveries are checked every six hours.",
                )}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {actions.map(({ action, label, description }) => (
                  <div
                    key={action}
                    className="flex flex-col items-start gap-3 rounded-xl border border-white/10 p-5"
                  >
                    <h3 className="font-bold">{t(label)}</h3>
                    <p className="flex-1 text-sm text-white/50">
                      {t(description)}
                    </p>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void run(action, {}, label)}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-50"
                    >
                      {busy === action && (
                        <Loader2 size={15} className="animate-spin" />
                      )}
                      {t("Run now")}
                    </button>
                  </div>
                ))}
              </div>
              {report && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4"
                >
                  <p className="font-bold">{t(report.label)}</p>
                  <p className="mt-2 text-sm">
                    {t("Processed")}: {report.result.processed} ·{" "}
                    {t("Succeeded")}: {report.result.succeeded} · {t("Failed")}:{" "}
                    {report.result.failed} · {t("Remaining")}:{" "}
                    {report.result.remaining}
                  </p>
                  {report.result.last_error && (
                    <p className="mt-2 text-sm text-amber-200">
                      {report.result.last_error}
                    </p>
                  )}
                </div>
              )}
            </section>
            {manualTracking && (
              <section className="space-y-3 rounded-xl border border-white/10 p-5">
                <h2 className="font-bold">{t("Check one delivery now")}</h2>
                <p className="text-sm text-white/50">
                  {t(
                    "Homologation only. Enter the Manifold order ID. A one-minute cooldown applies.",
                  )}
                </p>
                <form
                  className="flex flex-wrap gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      "track-deliveries",
                      { order_id: orderId.trim(), force: true },
                      "Check one delivery now",
                    );
                  }}
                >
                  <label htmlFor="gift-card-order-id" className="sr-only">
                    {t("Order ID")}
                  </label>
                  <input
                    id="gift-card-order-id"
                    value={orderId}
                    onChange={(event) => setOrderId(event.target.value)}
                    required
                    pattern="[0-9a-fA-F-]{36}"
                    placeholder={t("Order ID")}
                    className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-2"
                  />
                  <button
                    disabled={!!busy}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold disabled:opacity-50"
                  >
                    {t("Check now")}
                  </button>
                </form>
              </section>
            )}
            <section className="space-y-3">
              <h2 className="text-xl font-black">{t("Catalog")}</h2>
              <p className="text-sm text-white/50">
                {t("Last successful sync")}:{" "}
                {data.last_sync_at
                  ? new Date(data.last_sync_at).toLocaleString(locale)
                  : t("Never")}
              </p>
              {data.last_error && (
                <p className="text-sm text-amber-200">{data.last_error}</p>
              )}
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[0.04] text-white/50">
                    <tr>
                      <th className="p-4">{t("Product")}</th>
                      <th className="p-4">{t("Price")}</th>
                      <th className="p-4">{t("Availability")}</th>
                      <th className="p-4">{t("Sales")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((product) => (
                      <tr key={product.id} className="border-t border-white/10">
                        <td className="p-4">
                          <p className="font-semibold">{product.name}</p>
                          <p className="mt-1 text-xs text-white/40">
                            {product.code}
                          </p>
                        </td>
                        <td className="whitespace-nowrap p-4">
                          {formatMoney(
                            (product.amount_minor / 100).toFixed(2),
                            product.currency,
                          )}
                        </td>
                        <td className="p-4">
                          {product.available
                            ? t("Available")
                            : t("Unavailable")}
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={product.enabled}
                            aria-label={`${t("Enable sales")}: ${product.name}`}
                            disabled={
                              !!busy || (!product.available && !product.enabled)
                            }
                            onClick={() =>
                              void run("products", {
                                code: product.code,
                                enabled: !product.enabled,
                              })
                            }
                            className="rounded-lg border border-white/20 px-3 py-2 font-bold disabled:opacity-40"
                          >
                            {product.enabled ? t("Enabled") : t("Disabled")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.products.length && (
                  <p className="p-5 text-sm text-white/50">
                    {t(
                      "Sync the catalog to import products. New products are disabled until reviewed.",
                    )}
                  </p>
                )}
              </div>
            </section>
            {!!data.recent_orders?.length && (
              <section className="space-y-3">
                <h2 className="text-xl font-black">
                  {t("Recent gift card orders")}
                </h2>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="p-3">{t("Order ID")}</th>
                        <th className="p-3">{t("Status")}</th>
                        <th className="p-3">{t("Last error")}</th>
                        <th className="p-3">{t("Next delivery check")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_orders.map((order) => (
                        <tr key={order.id} className="border-t border-white/10">
                          <td className="p-3 font-mono text-xs">{order.id}</td>
                          <td className="p-3">{order.fulfillment_status}</td>
                          <td className="p-3 text-amber-200">
                            {order.last_error ?? "—"}
                          </td>
                          <td className="p-3">
                            {order.next_tracking_at
                              ? new Date(order.next_tracking_at).toLocaleString(
                                  locale,
                                )
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

export async function getServerSideProps() {
  const { giftCardsEnabled, manualTrackingEnabled } =
    await import("infra/runtime");
  if (!giftCardsEnabled()) return { notFound: true };
  return { props: { manualTracking: manualTrackingEnabled() } };
}

GiftCardOperationsPage.getLayout = (page: React.ReactElement) => (
  <BackofficeLayout>{page}</BackofficeLayout>
);
