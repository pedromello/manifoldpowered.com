import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  Gift,
  Gamepad2,
  Receipt,
  SearchX,
  X,
} from "lucide-react";

import { GiftCardArtwork } from "components/store/GiftCardArtwork";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";

type Payment = "pending" | "paid" | "cancelled" | "failed";
type ProductType = "all" | "game" | "gift-card";
type Filter = "all" | "pending" | "paid" | "cancelled";
type PreviewOrder = {
  id: string;
  title: string;
  type: Exclude<ProductType, "all">;
  artwork: string;
  amount: string;
  date: string;
  payment: Payment;
  availability: string;
  action: string;
  description: string;
};

// Synthetic presentation data only. These are not sales or payment records.
const orders: PreviewOrder[] = [
  {
    id: "MF-1026-006",
    title: "Nintendo eShop · R$25",
    type: "gift-card",
    artwork: "sandbox-brl-25",
    amount: "25.00",
    date: "2026-10-12T15:00:00Z",
    payment: "pending",
    availability: "Waiting for payment",
    action: "Continue purchase",
    description: "Complete your payment to receive your gift card.",
  },
  {
    id: "MF-1026-005",
    title: "Steam · R$100",
    type: "gift-card",
    artwork: "sandbox-brl-100",
    amount: "100.00",
    date: "2026-10-12T14:30:00Z",
    payment: "paid",
    availability: "Preparing your code",
    action: "View order",
    description:
      "Your payment is confirmed. Your code will appear in My gift cards when it is ready.",
  },
  {
    id: "MF-1026-004",
    title: "PlayStation Store · R$50",
    type: "gift-card",
    artwork: "sandbox-brl-50",
    amount: "50.00",
    date: "2026-10-11T16:00:00Z",
    payment: "paid",
    availability: "Code available",
    action: "View code",
    description:
      "Your gift card is ready. You can view your code in My gift cards.",
  },
  {
    id: "MF-1026-003",
    title: "Capyvarias",
    type: "game",
    artwork: "/images/social/home-catalog/capyvarias.jpg",
    amount: "29.90",
    date: "2026-10-10T17:00:00Z",
    payment: "paid",
    availability: "In your library",
    action: "Go to library",
    description: "Your game is in your library, ready to download and play.",
  },
  {
    id: "MF-1026-002",
    title: "Twisted Tower",
    type: "game",
    artwork: "/images/social/home-catalog/twisted-tower.jpg",
    amount: "49.90",
    date: "2026-10-09T14:00:00Z",
    payment: "cancelled",
    availability: "Purchase cancelled",
    action: "View order",
    description: "This purchase was cancelled. No payment was completed.",
  },
  {
    id: "MF-1026-001",
    title: "Nintendo eShop · R$25",
    type: "gift-card",
    artwork: "sandbox-brl-25",
    amount: "25.00",
    date: "2026-10-08T18:00:00Z",
    payment: "failed",
    availability: "Waiting for payment",
    action: "Try again",
    description: "Your payment was not approved. Try another payment method.",
  },
];

const paymentStyle = {
  pending: {
    label: "Awaiting payment",
    icon: Clock3,
    className: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  },
  paid: {
    label: "Paid",
    icon: Check,
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: X,
    className: "border-white/10 bg-white/5 text-white/60",
  },
  failed: {
    label: "Payment not approved",
    icon: CreditCard,
    className: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  },
};

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All orders" },
  { value: "pending", label: "Pending orders" },
  { value: "paid", label: "Paid orders" },
  { value: "cancelled", label: "Cancelled orders" },
];

function matchesFilter(order: PreviewOrder, filter: Filter) {
  return (
    filter === "all" ||
    (filter === "pending"
      ? order.payment === "pending" || order.payment === "failed"
      : order.payment === filter)
  );
}

function OrderRow({
  order,
  expanded,
  onToggle,
}: {
  order: PreviewOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t, locale } = useI18n();
  const status = paymentStyle[order.payment];
  const StatusIcon = status.icon;
  const TypeIcon = order.type === "game" ? Gamepad2 : Gift;
  const detailId = `details-${order.id}`;
  const thumbnailBackground =
    order.artwork === "sandbox-brl-25"
      ? "bg-[#e60012]"
      : order.artwork === "sandbox-brl-50"
        ? "bg-[#003791]"
        : "bg-[#1b2838]";

  return (
    <li
      className={`@container overflow-hidden rounded-2xl border transition-colors ${expanded ? "border-violet-400/40 bg-[#171120]" : "border-white/[0.08] bg-[#110d18] hover:border-white/15"}`}
    >
      <div className="flex flex-wrap items-start gap-4 p-4 sm:gap-5 sm:p-5 @3xl:flex-nowrap @3xl:items-center">
        <div
          className={`relative h-15 w-24 shrink-0 overflow-hidden rounded-lg sm:h-20 sm:w-32 ${thumbnailBackground}`}
        >
          {order.type === "gift-card" ? (
            <GiftCardArtwork
              productCode={order.artwork}
              sizes={order.artwork === "sandbox-brl-25" ? "640px" : "128px"}
            />
          ) : (
            <Image
              src={order.artwork}
              alt={order.title}
              fill
              sizes="128px"
              className="object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
            <TypeIcon size={13} aria-hidden="true" />
            {t(order.type === "game" ? "Game" : "Gift card")}
            <span aria-hidden="true">·</span>
            <time dateTime={order.date} className="whitespace-nowrap">
              {new Date(order.date).toLocaleDateString(locale, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
          </p>
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailId}
            className="mt-2 text-left text-base font-bold leading-snug text-white transition-colors hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400"
          >
            {order.title}
          </button>
          <p className="mt-1.5 text-sm text-white/55">
            {t(order.availability)}
          </p>
        </div>
        <div className="flex w-full items-center justify-between gap-3 border-t border-white/[0.06] pt-3 @3xl:w-auto @3xl:flex-col @3xl:items-end @3xl:border-0 @3xl:pt-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}
          >
            <StatusIcon size={13} aria-hidden="true" />
            {t(status.label)}
          </span>
          <span className="whitespace-nowrap text-base font-bold">
            {formatMoney(order.amount, "BRL")}
          </span>
        </div>
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={`${t(order.action)} · ${order.title} · ${order.id}`}
          className={`inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400 @3xl:ml-2 @3xl:w-44 ${order.payment === "pending" || order.payment === "failed" ? "bg-violet-600 text-white hover:bg-violet-500" : "border border-white/10 bg-white/[0.035] text-white/80 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"}`}
        >
          {t(order.action)}
          {expanded ? (
            <ChevronDown size={15} aria-hidden="true" />
          ) : (
            <ArrowRight size={15} aria-hidden="true" />
          )}
        </button>
      </div>
      <section id={detailId} hidden={!expanded} aria-label={t("Order details")}>
        <div className="border-t border-white/[0.08] bg-violet-400/[0.025] p-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">{t("Order details")}</h3>
            <span className="text-xs text-white/40">{order.id}</span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
            {t(order.description)}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-white/40">{t("Payment")}</dt>
              <dd className="mt-1.5 font-semibold">{t(status.label)}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/40">{t("Your product")}</dt>
              <dd className="mt-1.5 font-semibold">{t(order.availability)}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/40">{t("Order total")}</dt>
              <dd className="mt-1.5 font-semibold">
                {formatMoney(order.amount, "BRL")}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </li>
  );
}

export function OrdersPrototype() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [productType, setProductType] = useState<ProductType>("all");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const matchingType = orders.filter(
    (order) => productType === "all" || order.type === productType,
  );
  const visibleOrders = matchingType.filter((order) =>
    matchesFilter(order, filter),
  );

  return (
    <>
      <header className="mt-7 pb-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-violet-300">
          <Receipt size={15} aria-hidden="true" />
          {t("Your account")}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {t("My orders")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          {t("Track your game and gift card purchases.")}
        </p>
      </header>

      <section aria-label={t("Filter orders")}>
        <div className="flex flex-col justify-between gap-5 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-center">
          <div
            className="flex flex-wrap gap-2"
            aria-label={t("Payment status")}
          >
            {filters.map((item) => (
              <button
                key={item.value}
                aria-pressed={filter === item.value}
                onClick={() => {
                  setFilter(item.value);
                  setSelectedOrder(null);
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 sm:px-4 ${filter === item.value ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25" : "text-white/50 hover:bg-white/5 hover:text-white"}`}
              >
                {t(item.label)}
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px]">
                  {
                    matchingType.filter((order) =>
                      matchesFilter(order, item.value),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-white/50">
            <label htmlFor="order-product-type">{t("Product type")}</label>
            <select
              id="order-product-type"
              value={productType}
              onChange={(event) => {
                setProductType(event.target.value as ProductType);
                setSelectedOrder(null);
              }}
              className="min-h-10 flex-1 rounded-lg border border-white/10 bg-[#171120] px-3 text-sm font-semibold text-white/80 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 lg:flex-none"
            >
              <option value="all">{t("All products")}</option>
              <option value="game">{t("Games")}</option>
              <option value="gift-card">{t("Gift cards")}</option>
            </select>
          </div>
        </div>
      </section>

      <p className="mb-4 mt-6 text-xs text-white/45" role="status">
        {t(visibleOrders.length === 1 ? "{count} order" : "{count} orders", {
          count: visibleOrders.length,
        })}
      </p>
      {visibleOrders.length ? (
        <ul className="space-y-3" aria-label={t("My orders")}>
          {visibleOrders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              expanded={selectedOrder === order.id}
              onToggle={() =>
                setSelectedOrder((current) =>
                  current === order.id ? null : order.id,
                )
              }
            />
          ))}
        </ul>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
          <SearchX size={32} className="text-white/30" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold">
            {t("No orders match these filters")}
          </h2>
          <p className="mt-2 text-sm text-white/50">
            {t("Choose another status or product type to see your orders.")}
          </p>
          <button
            onClick={() => {
              setFilter("all");
              setProductType("all");
              setSelectedOrder(null);
            }}
            className="mt-5 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            {t("Clear filters")}
          </button>
        </div>
      )}
    </>
  );
}
