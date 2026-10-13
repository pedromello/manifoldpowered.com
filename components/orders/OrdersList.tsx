import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Gamepad2,
  Gift,
  Loader2,
  Receipt,
  SearchX,
} from "lucide-react";
import { GiftCardArtwork } from "components/store/GiftCardArtwork";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";
import {
  purchasePaymentLabels,
  purchaseAvailability,
} from "lib/purchase-status";
import type { BuyerOrder } from "contracts/purchase-orders";

async function fetchPrivate(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
const filters = [
  { value: "all", label: "All orders" },
  { value: "pending", label: "Pending orders" },
  { value: "paid", label: "Paid orders" },
  { value: "cancelled", label: "Cancelled orders" },
];
function matches(order: BuyerOrder, status: string) {
  return (
    status === "all" ||
    (status === "pending"
      ? ["UNPAID", "PENDING", "PROCESSING", "FAILED"].includes(
          order.payment_status,
        )
      : status === "paid"
        ? order.payment_status === "PAID"
        : order.payment_status === "CANCELLED")
  );
}
const money = (amount: number, currency: string) =>
  formatMoney((amount / 100).toFixed(2), currency);
export function OrdersList() {
  const { t, locale } = useI18n();
  const {
    data: user,
    error: userError,
    isLoading: loadingUser,
  } = useSWR<{ id: string }>("/api/v1/user", fetchPrivate, {
    shouldRetryOnError: false,
  });
  const { data, error, isLoading, mutate } = useSWR<{ orders: BuyerOrder[] }>(
    user ? ["/api/v1/orders", user.id] : null,
    ([url]) => fetchPrivate(url),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
      refreshInterval: 15000,
    },
  );
  const [filter, setFilter] = useState("all"),
    [type, setType] = useState("all"),
    [selected, setSelected] = useState<string | null>(null);
  const orders = user ? (data?.orders ?? []) : [];
  const ofType = orders.filter(
    (order) => type === "all" || order.item_type === type,
  );
  const visible = ofType.filter((order) => matches(order, filter));
  const logout = !!userError && ["401", "403"].includes(userError.message);
  if (logout)
    return (
      <section className="mt-10 rounded-2xl border border-white/10 p-10 text-center">
        <h2 className="text-xl font-bold">{t("Log in to see your orders")}</h2>
        <Link
          href="/login?callbackUrl=/library/orders"
          className="mt-6 inline-flex rounded-lg bg-violet-600 px-5 py-3 font-semibold hover:bg-violet-500"
        >
          {t("Log in")}
        </Link>
      </section>
    );
  if (error || userError)
    return (
      <div role="alert" className="mt-8 rounded-xl border border-white/10 p-6">
        <p>{t("We could not load your orders. Try again.")}</p>
        <button
          className="mt-4 text-violet-200 underline"
          onClick={() => mutate()}
        >
          {t("Try again")}
        </button>
      </div>
    );
  if (loadingUser || isLoading)
    return (
      <p role="status" className="flex items-center gap-2 py-20 text-white/50">
        <Loader2 className="animate-spin" />
        {t("Loading your orders")}
      </p>
    );
  return (
    <>
      <section
        aria-label={t("Filter orders")}
        className="flex flex-col justify-between gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-center"
      >
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.value}
              aria-pressed={filter === item.value}
              onClick={() => {
                setFilter(item.value);
                setSelected(null);
              }}
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 ${filter === item.value ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25" : "text-white/50 hover:bg-white/5 hover:text-white"}`}
            >
              {t(item.label)}{" "}
              <span className="ml-1 rounded bg-white/5 px-1.5 text-xs">
                {ofType.filter((order) => matches(order, item.value)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <label htmlFor="real-order-type">{t("Product type")}</label>
          <select
            id="real-order-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setSelected(null);
            }}
            className="min-h-10 rounded-lg border border-white/10 bg-[#171120] px-3 text-sm text-white"
          >
            <option value="all">{t("All products")}</option>
            <option value="GAME">{t("Games")}</option>
            <option value="GIFT_CARD">{t("Gift cards")}</option>
          </select>
        </div>
      </section>
      <p role="status" className="mb-4 mt-6 text-xs text-white/45">
        {t(visible.length === 1 ? "{count} order" : "{count} orders", {
          count: visible.length,
        })}
      </p>
      {visible.length ? (
        <ul className="space-y-3" aria-label={t("My orders")}>
          {visible.map((order) => {
            const expanded = selected === order.id;
            const badge =
              order.payment_status === "PAID"
                ? "bg-emerald-400/10 text-emerald-200"
                : ["FAILED", "DISPUTED"].includes(order.payment_status)
                  ? "bg-rose-400/10 text-rose-200"
                  : order.payment_status === "ACQUIRED" ||
                      order.payment_status === "CANCELLED"
                    ? "bg-white/5 text-white/60"
                    : "bg-amber-400/10 text-amber-200";
            const awaiting = [
              "UNPAID",
              "PENDING",
              "PROCESSING",
              "FAILED",
            ].includes(order.payment_status);
            const href = awaiting
              ? `/checkout/${order.id}`
              : order.gift_card_order_id
                ? `/library/gift-cards?order=${order.gift_card_order_id}`
                : "/library";
            const action = awaiting
              ? order.payment_status === "FAILED"
                ? "Try again"
                : order.payment_status === "UNPAID"
                  ? "Continue purchase"
                  : "View payment"
              : order.delivery_status === "READY"
                ? order.item_type === "GAME"
                  ? "Go to library"
                  : "View code"
                : "View order";
            return (
              <li
                key={order.id}
                className={`@container overflow-hidden rounded-2xl border ${expanded ? "border-violet-400/40 bg-[#171120]" : "border-white/10 bg-[#110d18]"}`}
              >
                <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5 @3xl:flex-nowrap @3xl:items-center">
                  <div
                    className={`relative h-15 w-24 shrink-0 overflow-hidden rounded-lg sm:h-20 sm:w-32 ${order.item_id === "sandbox-brl-25" ? "bg-[#e60012]" : order.item_id === "sandbox-brl-50" ? "bg-[#003791]" : "bg-[#1b2838]"}`}
                  >
                    {order.item_type === "GIFT_CARD" ? (
                      <GiftCardArtwork
                        productCode={order.item_id}
                        sizes={
                          order.item_id === "sandbox-brl-25" ? "640px" : "128px"
                        }
                      />
                    ) : order.image_url ? (
                      <Image
                        src={order.image_url}
                        alt={order.product_name}
                        fill
                        sizes="128px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/40">
                        <Gamepad2 size={32} aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                      {order.item_type === "GAME" ? (
                        <Gamepad2 size={13} />
                      ) : (
                        <Gift size={13} />
                      )}{" "}
                      {t(order.item_type === "GAME" ? "Game" : "Gift card")} ·{" "}
                      <time
                        dateTime={order.created_at}
                        className="whitespace-nowrap"
                      >
                        {new Date(order.created_at).toLocaleDateString(locale)}
                      </time>
                    </p>
                    <button
                      onClick={() => setSelected(expanded ? null : order.id)}
                      aria-expanded={expanded}
                      aria-controls={`order-${order.id}`}
                      className="mt-2 text-left text-base font-bold hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-400"
                    >
                      {order.product_name}
                    </button>
                    {(["PAID", "ACQUIRED"].includes(order.payment_status) ||
                      order.delivery_status === "REVIEW") && (
                      <p className="mt-1.5 text-sm text-white/55">
                        {t(
                          purchaseAvailability(
                            order.item_type,
                            order.payment_status,
                            order.delivery_status,
                          ),
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full justify-between gap-3 border-t border-white/5 pt-3 @3xl:w-auto @3xl:flex-col @3xl:items-end @3xl:border-0 @3xl:pt-0">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}
                    >
                      {t(
                        purchasePaymentLabels[order.payment_status] ??
                          "Purchase under review",
                      )}
                    </span>
                    <span className="whitespace-nowrap font-bold">
                      {money(order.total_minor, order.currency)}
                    </span>
                  </div>
                  {awaiting ||
                  (order.delivery_status === "READY" &&
                    !["REFUNDED", "DISPUTED"].includes(
                      order.payment_status,
                    )) ? (
                    <Link
                      href={href}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-violet-600 px-4 text-sm font-semibold transition-colors hover:bg-violet-500 @3xl:w-44"
                    >
                      {t(action)}
                      <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <button
                      onClick={() => setSelected(expanded ? null : order.id)}
                      aria-expanded={expanded}
                      aria-controls={`order-${order.id}`}
                      className="min-h-10 w-full rounded-lg border border-white/10 px-4 text-sm font-semibold hover:bg-white/5 @3xl:w-44"
                    >
                      {t("View order")}
                    </button>
                  )}
                </div>
                <section
                  id={`order-${order.id}`}
                  hidden={!expanded}
                  aria-label={t("Order details")}
                  className="border-t border-white/10 p-5"
                >
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <Receipt size={15} />
                    {t("Order details")}
                    <ChevronDown size={15} />
                  </h3>
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-white/40">{t("Payment")}</dt>
                      <dd className="mt-1">
                        {t(purchasePaymentLabels[order.payment_status])}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/40">
                        {t("Your product")}
                      </dt>
                      <dd className="mt-1">
                        {t(
                          purchaseAvailability(
                            order.item_type,
                            order.payment_status,
                            order.delivery_status,
                          ),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/40">
                        {t("Product price")}
                      </dt>
                      <dd className="mt-1">
                        {money(order.amount_minor, order.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/40">
                        {t("Order total")}
                      </dt>
                      <dd className="mt-1">
                        {money(order.total_minor, order.currency)}
                        {order.installments > 1
                          ? ` · ${order.installments}x`
                          : ""}
                      </dd>
                    </div>
                  </dl>
                  {order.interest_minor > 0 && (
                    <p className="mt-4 text-xs text-white/50">
                      {t("Installment interest")}:{" "}
                      {money(order.interest_minor, order.currency)}
                    </p>
                  )}
                </section>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
          <SearchX size={32} className="text-white/30" />
          <h2 className="mt-4 text-lg font-bold">
            {t(
              orders.length
                ? "No orders match these filters"
                : "No purchases yet",
            )}
          </h2>
          <p className="mt-2 text-sm text-white/50">
            {t(
              orders.length
                ? "Choose another status or product type to see your orders."
                : "Your game and gift card purchases will appear here.",
            )}
          </p>
          {orders.length ? (
            <button
              onClick={() => {
                setFilter("all");
                setType("all");
              }}
              className="mt-5 rounded-lg border border-white/15 px-4 py-2.5 hover:bg-white/5"
            >
              {t("Clear filters")}
            </button>
          ) : (
            <Link
              href="/store"
              className="mt-5 rounded-lg bg-violet-600 px-4 py-2.5 hover:bg-violet-500"
            >
              {t("Back to store")}
            </Link>
          )}
        </section>
      )}
    </>
  );
}
