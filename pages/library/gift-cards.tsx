import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, type ReactElement } from "react";
import useSWR, { SWRConfig } from "swr";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";
import type { GiftCardProduct } from "infra/gift_card_provider";
import type { giftCardOrderOutput } from "models/gift_card_order";

type Order = ReturnType<typeof giftCardOrderOutput>;
type Catalogue = {
  products: GiftCardProduct[];
  orders: Order[];
  checkout_available: boolean;
};
const pending = [
  "CHECKOUT_PENDING",
  "AWAITING_PAYMENT",
  "PAID",
  "ISSUANCE_FAILED",
];
const statusLabels = {
  CHECKOUT_PENDING: "Checkout needs another attempt",
  AWAITING_PAYMENT: "Awaiting payment confirmation",
  PAID: "Payment confirmed · issuing gift card",
  ISSUANCE_FAILED: "Payment confirmed · delivery pending",
  FULFILLED: "Gift card delivered",
  CANCELLED: "Purchase cancelled",
  PAYMENT_FAILED: "Payment failed",
};

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const error = new Error(
      "The purchase could not be updated. Try again.",
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
    refreshInterval: (value) =>
      value?.orders.some((order) => pending.includes(order.status)) ? 3000 : 0,
  });
  const selectedId =
    typeof router.query.order === "string" ? router.query.order : null;
  const { data: selectedOrder } = useSWR<Order>(
    selectedId
      ? `/api/v1/gift-card-orders/${encodeURIComponent(selectedId)}`
      : null,
    request,
    {
      shouldRetryOnError: false,
      refreshInterval: (order) =>
        order && pending.includes(order.status) ? 3000 : 0,
    },
  );
  const orders = data?.orders ?? [];
  const visibleOrders =
    selectedOrder && !orders.some((order) => order.id === selectedOrder.id)
      ? [selectedOrder, ...orders]
      : orders;

  async function buy(product: GiftCardProduct) {
    setBusy(true);
    setMessage("");
    try {
      // Keep the request stable through network failures and page refreshes.
      // A completed request is replaced only on an explicit new purchase.
      const storageKey = `gift-card-request:${product.code}`;
      let key = sessionStorage.getItem(storageKey);
      if (
        !key ||
        orders.some(
          (order) =>
            order.product_code === product.code &&
            !pending.includes(order.status),
        )
      ) {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      const order = await request<Order>("/api/v1/gift-card-orders", {
        product_code: product.code,
        idempotency_key: key,
      });
      await mutate();
      if (order.checkout_url) window.location.assign(order.checkout_url);
    } catch {
      setMessage(t("The purchase could not be updated. Try again."));
      await mutate();
    } finally {
      setBusy(false);
    }
  }

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
      setMessage(t("The purchase could not be updated. Try again."));
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
      <main className="min-h-[70vh] bg-[#0b0812] px-4 py-10 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/library"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 hover:text-white"
          >
            <ArrowLeft size={16} />
            {t("Back to library")}
          </Link>
          <header className="mt-7 border-b border-white/10 pb-8">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-300">
              <Gift size={16} />
              {t("Test purchases")}
            </p>
            <h1 className="mt-3 text-3xl font-black">{t("Gift cards")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              {t(
                "Test payments only. Demo gift cards have no real value and cannot be redeemed.",
              )}
            </p>
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
                    "Test checkout is unavailable. You can review your purchases here.",
                  )}
                </p>
              )}
              {router.query.checkout === "returned" && (
                <p className="mt-6 text-sm text-violet-200" role="status">
                  {t(
                    "Your return from checkout does not confirm payment. Delivery will appear after payment verification.",
                  )}
                </p>
              )}
              {router.query.checkout === "cancelled" && (
                <p className="mt-6 text-sm text-violet-200" role="status">
                  {t(
                    "Checkout was closed. Resume the purchase or cancel it below.",
                  )}
                </p>
              )}
              <section className="mt-8" aria-label={t("Available gift cards")}>
                <h2 className="text-lg font-bold">
                  {t("Available gift cards")}
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {data?.products.map((product) => {
                    const active = orders.some(
                      (order) =>
                        order.product_code === product.code &&
                        pending.includes(order.status),
                    );
                    return (
                      <article
                        key={product.code}
                        className="rounded-xl border border-white/10 bg-[#14101c] p-6"
                      >
                        <Gift className="text-violet-300" size={28} />
                        <h3 className="mt-4 font-bold">{product.name}</h3>
                        <p className="mt-2 text-xl font-bold">
                          {formatMoney(
                            (product.amount_minor / 100).toFixed(2),
                            product.currency,
                          )}
                        </p>
                        <button
                          type="button"
                          disabled={busy || !data.checkout_available || active}
                          onClick={() => buy(product)}
                          className="mt-5 rounded-lg bg-violet-600 px-5 py-3 text-sm font-bold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t(
                            active
                              ? "Purchase already in progress"
                              : "Buy in test mode",
                          )}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
              <section
                className="mt-10"
                aria-label={t("Your gift card purchases")}
              >
                <h2 className="text-lg font-bold">
                  {t("Your gift card purchases")}
                </h2>
                {message && (
                  <p role="alert" className="mt-4 text-sm text-amber-200">
                    {message}
                  </p>
                )}
                {visibleOrders.length === 0 && (
                  <p className="mt-4 text-sm text-white/60">
                    {t("No gift card purchases yet.")}
                  </p>
                )}
                <div className="mt-4 space-y-4">
                  {visibleOrders.map((order) => (
                    <article
                      key={order.id}
                      className={`rounded-xl border bg-[#14101c] p-5 ${order.id === selectedId ? "border-violet-400/50" : "border-white/10"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h3 className="font-bold">{order.product_name}</h3>
                        <span className="font-semibold">
                          {formatMoney(
                            (order.amount_minor / 100).toFixed(2),
                            order.currency,
                          )}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-violet-200" role="status">
                        {t(statusLabels[order.status])}
                      </p>
                      <p className="mt-2 break-all text-xs text-white/50">
                        {t("Order")}: {order.id} ·{" "}
                        {new Date(order.created_at).toLocaleDateString(locale)}
                      </p>
                      {order.last_error === "PAYMENT_ATTEMPT_FAILED" && (
                        <p className="mt-3 text-sm text-amber-200">
                          {t(
                            "The payment attempt failed. You can retry in the same checkout.",
                          )}
                        </p>
                      )}
                      {order.status === "ISSUANCE_FAILED" && (
                        <p className="mt-3 text-sm text-amber-200">
                          {t(
                            "You do not need to pay again. Retry delivery for this purchase.",
                          )}
                        </p>
                      )}
                      {order.gift_card_code && (
                        <p
                          className="mt-4 rounded-lg bg-white/5 p-4 font-mono text-xs break-all"
                          aria-label={t("Demo gift card code")}
                        >
                          {order.gift_card_code}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        {["CHECKOUT_PENDING", "AWAITING_PAYMENT"].includes(
                          order.status,
                        ) && (
                          <>
                            <button
                              disabled={busy || !data?.checkout_available}
                              onClick={() => act(order, "checkout")}
                              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold disabled:opacity-40"
                            >
                              {t("Resume checkout")}
                            </button>
                            <button
                              disabled={busy || !data?.checkout_available}
                              onClick={() => act(order, "cancel")}
                              className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-40"
                            >
                              {t("Cancel purchase")}
                            </button>
                          </>
                        )}
                        {order.status === "ISSUANCE_FAILED" && (
                          <button
                            disabled={busy}
                            onClick={() => act(order, "retry_issuance")}
                            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold disabled:opacity-40"
                          >
                            {t("Retry delivery")}
                          </button>
                        )}
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
  if (!["development", "test"].includes(process.env.NODE_ENV))
    return { notFound: true };
  return { props: {} };
}

GiftCardsPage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
