import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, type ReactElement } from "react";
import useSWR, { SWRConfig } from "swr";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gift,
  Loader2,
} from "lucide-react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";
import { giftCardsEnabled } from "infra/runtime";
import type { giftCardOrderOutput } from "models/gift_card_order";
import { GiftCardReveal } from "components/GiftCardReveal";
import { useGiftCardEntry } from "lib/useGiftCardEntry";
import {
  GiftCardArtwork,
  giftCardArtwork,
} from "components/store/GiftCardArtwork";

type Order = ReturnType<typeof giftCardOrderOutput> & {
  delivery_channel?: "EMAIL" | "CODE";
  recipient_email?: string | null;
  fulfillment_status?: string | null;
  next_tracking_at?: string | null;
};
type Catalogue = {
  orders: Order[];
  checkout_available: boolean;
};
const pending = [
  "CHECKOUT_PENDING",
  "AWAITING_PAYMENT",
  "PAID",
  "ISSUANCE_FAILED",
];
const awaitingPayment = ["CHECKOUT_PENDING", "AWAITING_PAYMENT"];
const statusLabels = {
  CHECKOUT_PENDING: "Payment incomplete",
  AWAITING_PAYMENT: "Awaiting payment confirmation",
  PAID: "Payment confirmed · preparing your code",
  ISSUANCE_FAILED: "Payment confirmed · delivery pending",
  FULFILLED: "Gift card delivered",
  CANCELLED: "Purchase cancelled",
  PAYMENT_FAILED: "Payment failed",
};

function deliveryLabel(order: Order) {
  if (order.delivery_channel !== "EMAIL") return statusLabels[order.status];
  if (order.status === "CANCELLED" && order.paid_at)
    return "Purchase under review";
  if (order.fulfillment_status === "REVIEW") return "Delivery needs review";
  if (order.fulfillment_status === "CANCELLED")
    return "Delivery cancelled · support required";
  if (order.fulfillment_status === "DELIVERED") return "Delivered by email";
  if (["PAID", "ISSUANCE_FAILED"].includes(order.status))
    return "Payment confirmed · email delivery pending";
  return statusLabels[order.status];
}

function emailDeliveryDescription(order: Order) {
  if (order.status === "CANCELLED")
    return order.paid_at
      ? "Do not pay again. Contact support with your order number."
      : "This purchase was cancelled. No payment was completed.";
  if (order.status === "PAYMENT_FAILED")
    return "Your payment was unsuccessful. You can try again.";
  if (order.fulfillment_status === "DELIVERED")
    return "Check your inbox and spam folder for your gift card email.";
  if (["CANCELLED", "REVIEW"].includes(order.fulfillment_status ?? ""))
    return "Do not pay again. Contact support with your order number.";
  return awaitingPayment.includes(order.status)
    ? "Complete your payment to receive your gift card."
    : "Delivery updates appear here automatically. You do not need to pay again.";
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const error = new Error(
      "We could not complete this action. Try again.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function GiftCardsContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { data, error, isLoading, mutate } = useSWR<
    Catalogue,
    Error & { status: number }
  >("/api/v1/gift-card-orders", request, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    refreshInterval: 15000,
  });
  const selectedId =
    typeof router.query.order === "string" ? router.query.order : null;
  const { data: selectedOrder, mutate: mutateSelected } = useSWR<Order>(
    selectedId
      ? `/api/v1/gift-card-orders/${encodeURIComponent(selectedId)}`
      : null,
    request,
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
      refreshInterval: 15000,
    },
  );
  useGiftCardEntry(
    selectedId,
    selectedOrder?.id,
    Boolean(
      selectedOrder &&
      selectedOrder.delivery_channel !== "EMAIL" &&
      pending.includes(selectedOrder.status),
    ),
    async (id) => {
      try {
        await request<Order>(`/api/v1/gift-card-orders/${id}`, {
          action: "reconcile_payment",
        });
      } catch {
        setMessage(
          t(
            "We could not confirm your payment right now. Check this purchase again in a few moments.",
          ),
        );
      } finally {
        await Promise.allSettled([mutate(), mutateSelected()]);
      }
    },
  );
  const orders = data?.orders ?? [];
  const visibleOrders =
    selectedOrder && !orders.some((order) => order.id === selectedOrder.id)
      ? [selectedOrder, ...orders]
      : orders;

  async function act(
    order: Order,
    action: "checkout" | "cancel" | "retry_issuance",
  ) {
    setBusy(true);
    setMessage("");
    try {
      const result = await request<Order>(
        `/api/v1/gift-card-orders/${order.id}`,
        { action },
      );
      await mutate();
      if (action === "checkout" && result.checkout_url)
        window.location.assign(result.checkout_url);
      if (action === "cancel" && result.status === "AWAITING_PAYMENT")
        setMessage(
          t(
            "Payment confirmation is still pending. This purchase cannot be cancelled yet.",
          ),
        );
    } catch {
      setMessage(t("We could not complete this action. Try again."));
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Gift cards | Manifold")}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="min-h-[70vh] bg-[#0b0812] px-4 py-8 text-white sm:px-6 sm:py-12 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/library"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"
          >
            <ArrowLeft size={16} />
            {t("Back to library")}
          </Link>
          <header className="mt-8 flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-8">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-300">
                <Gift size={16} />
                {t("Your purchases")}
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                {t("Gift cards")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                {t("Track your gift card purchases and delivery here.")}
              </p>
            </div>
            <Link
              href="/store/gift-cards"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold transition-colors hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
            >
              {t("Explore gift cards")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </header>
          {error ? (
            <section className="mt-8 rounded-xl border border-white/10 bg-[#14101c] p-6">
              <h2 className="text-xl font-bold">
                {t(
                  error.status === 401
                    ? "Log in to see your purchases"
                    : error.status === 403
                      ? "Activate your account to buy gift cards."
                      : "Gift card purchases are temporarily unavailable.",
                )}
              </h2>
              {error.status === 401 && (
                <Link
                  href="/login?callbackUrl=/library/gift-cards"
                  className="mt-5 inline-flex rounded-lg bg-violet-600 px-5 py-3 font-bold"
                >
                  {t("Log in")}
                </Link>
              )}
            </section>
          ) : isLoading ? (
            <div className="flex items-center gap-3 py-16" role="status">
              <Loader2 className="animate-spin" size={20} />
              {t("Loading purchase history")}
            </div>
          ) : (
            <>
              {!data?.checkout_available && (
                <p
                  className="mt-6 rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200"
                  role="status"
                >
                  {t(
                    "New purchases are currently unavailable. You can still track your gift cards here.",
                  )}
                </p>
              )}
              {router.query.checkout === "returned" &&
                (selectedOrder
                  ? awaitingPayment.includes(selectedOrder.status)
                  : visibleOrders.some((order) =>
                      awaitingPayment.includes(order.status),
                    )) && (
                  <p className="mt-6 text-sm text-violet-200" role="status">
                    {t(
                      "We are confirming your payment. Delivery starts after payment confirmation.",
                    )}
                  </p>
                )}
              {router.query.checkout === "cancelled" && (
                <p className="mt-6 text-sm text-violet-200" role="status">
                  {t(
                    "Your purchase was not completed. You can continue or cancel it below.",
                  )}
                </p>
              )}
              <section
                className="mt-10"
                aria-label={t("Your gift card purchases")}
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold">
                    {t("Your gift card purchases")}
                  </h2>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs tabular-nums text-white/50">
                    {visibleOrders.length}
                  </span>
                </div>
                {message && (
                  <p role="alert" className="mt-4 text-sm text-amber-200">
                    {message}
                  </p>
                )}
                {visibleOrders.length === 0 && (
                  <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
                    <div className="mb-5 rounded-2xl bg-violet-400/10 p-4 text-violet-300">
                      <Gift size={32} aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-semibold">
                      {t("No gift card purchases yet.")}
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-white/50">
                      {t(
                        "Choose a gift card in the store and track its delivery here.",
                      )}
                    </p>
                    <Link
                      href="/store/gift-cards"
                      className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-semibold transition-colors hover:bg-violet-500"
                    >
                      {t("Explore gift cards")}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                )}
                <div className="mt-4 space-y-4">
                  {visibleOrders.map((order) => (
                    <article
                      key={order.id}
                      className={`overflow-hidden rounded-2xl border bg-[#16121d] ${order.id === selectedId ? "border-violet-400/50" : "border-white/10"}`}
                    >
                      {order.id === selectedId &&
                        ["CHECKOUT_PENDING", "AWAITING_PAYMENT"].includes(
                          order.status,
                        ) && (
                          <p className="border-b border-violet-400/20 bg-violet-400/5 px-5 py-3 text-sm font-semibold text-violet-200">
                            {t("Continue your purchase")}
                          </p>
                        )}
                      <div className="grid min-w-0 sm:grid-cols-[220px_minmax(0,1fr)]">
                        <div
                          className={`flex items-center overflow-hidden ${order.product_code === "sandbox-brl-25" ? "bg-[#e60012]" : order.product_code === "sandbox-brl-50" ? "bg-[#003791]" : "bg-[#1b2838]"}`}
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden">
                            <GiftCardArtwork
                              productCode={order.product_code}
                              sizes="(min-width: 640px) 220px, 100vw"
                            />
                          </div>
                        </div>
                        <div className="min-w-0 p-5 sm:p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">
                                {giftCardArtwork[order.product_code]
                                  ?.platform ?? t("Gift cards")}
                              </p>
                              <h3 className="mt-1 text-xl font-semibold tracking-tight">
                                {order.product_name}
                              </h3>
                            </div>
                            <span className="shrink-0 text-lg font-semibold tabular-nums sm:text-xl">
                              {formatMoney(
                                (order.amount_minor / 100).toFixed(2),
                                order.currency,
                              )}
                            </span>
                          </div>
                          <p
                            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${order.status === "FULFILLED" ? "bg-emerald-400/10 text-emerald-300" : ["CANCELLED", "PAYMENT_FAILED"].includes(order.status) ? "bg-white/5 text-white/50" : "bg-amber-400/10 text-amber-200"}`}
                            role="status"
                          >
                            {order.status === "FULFILLED" ? (
                              <CheckCircle2 size={13} aria-hidden="true" />
                            ) : (
                              <Clock3 size={13} aria-hidden="true" />
                            )}
                            {t(deliveryLabel(order))}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/50">
                            <p>
                              {t("Purchased on")}{" "}
                              <time dateTime={order.created_at}>
                                {new Date(order.created_at).toLocaleDateString(
                                  locale,
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </time>
                            </p>
                          </div>
                          {order.last_error === "PAYMENT_ATTEMPT_FAILED" && (
                            <p className="mt-3 text-sm text-amber-200">
                              {t(
                                "Your payment was unsuccessful. You can try again.",
                              )}
                            </p>
                          )}
                          {order.status === "ISSUANCE_FAILED" &&
                            order.delivery_channel !== "EMAIL" && (
                              <p className="mt-3 text-sm text-amber-200">
                                {t(
                                  "You do not need to pay again. Retry delivery for this purchase.",
                                )}
                              </p>
                            )}
                          <div className="mt-5 border-t border-white/10 pt-5">
                            {order.status === "FULFILLED" &&
                              order.delivery_channel !== "EMAIL" && (
                                <GiftCardReveal
                                  key={order.id}
                                  orderId={order.id}
                                  firstRevealedAt={order.first_revealed_at}
                                  onRevealed={() =>
                                    Promise.all([mutate(), mutateSelected()])
                                  }
                                />
                              )}
                            {order.delivery_channel === "EMAIL" && (
                              <div className="mb-4 space-y-2 text-sm leading-6 text-white/65">
                                {order.recipient_email && (
                                  <p className="break-all">
                                    {t("Delivery email")}:{" "}
                                    {order.recipient_email}
                                  </p>
                                )}
                                <p>{t(emailDeliveryDescription(order))}</p>
                                {order.next_tracking_at &&
                                  !["DELIVERED", "CANCELLED"].includes(
                                    order.fulfillment_status ?? "",
                                  ) && (
                                    <p className="text-xs text-white/45">
                                      {t("Next delivery check")}:{" "}
                                      <time dateTime={order.next_tracking_at}>
                                        {new Date(
                                          order.next_tracking_at,
                                        ).toLocaleString(locale)}
                                      </time>
                                    </p>
                                  )}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-3">
                              {(awaitingPayment.includes(order.status) ||
                                (order.delivery_channel === "EMAIL" &&
                                  order.status === "PAYMENT_FAILED")) && (
                                <>
                                  {order.delivery_channel === "EMAIL" ? (
                                    <Link
                                      href={`/checkout/${order.id}`}
                                      className="inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-4 text-sm font-semibold hover:bg-violet-500"
                                    >
                                      {t(
                                        order.status === "PAYMENT_FAILED"
                                          ? "Try again"
                                          : "Continue purchase",
                                      )}
                                    </Link>
                                  ) : (
                                    <button
                                      disabled={
                                        busy || !data?.checkout_available
                                      }
                                      onClick={() => act(order, "checkout")}
                                      className="min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold transition-colors hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {t("Continue purchase")}
                                    </button>
                                  )}
                                  <button
                                    disabled={busy || !data?.checkout_available}
                                    onClick={() => act(order, "cancel")}
                                    className="min-h-11 rounded-lg border border-white/20 px-4 text-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {t("Cancel purchase")}
                                  </button>
                                </>
                              )}
                              {order.delivery_channel !== "EMAIL" &&
                                ["PAID", "ISSUANCE_FAILED"].includes(
                                  order.status,
                                ) && (
                                  <button
                                    disabled={busy}
                                    onClick={() => act(order, "retry_issuance")}
                                    className="min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold transition-colors hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {t("Retry delivery")}
                                  </button>
                                )}
                            </div>
                            <details className="mt-4 text-xs text-white/45">
                              <summary className="w-fit cursor-pointer rounded transition-colors hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300">
                                {t("Order details")}
                              </summary>
                              <p className="mt-2 break-all">
                                {t("Order")}: {order.id}
                              </p>
                              <Link
                                href={`/library/gift-cards?order=${order.id}`}
                                prefetch={false}
                                className="mt-2 inline-flex items-center gap-1 text-violet-300 hover:text-violet-100"
                              >
                                {t("View order")}
                                <ArrowRight size={12} aria-hidden="true" />
                              </Link>
                            </details>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default function GiftCardsPage() {
  // Discard private codes when leaving the page, including on sign-out. A
  // later account must not receive the previous account's global SWR cache.
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <GiftCardsContent />
    </SWRConfig>
  );
}

export async function getServerSideProps() {
  if (!giftCardsEnabled()) return { notFound: true };
  return { props: {} };
}

GiftCardsPage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
