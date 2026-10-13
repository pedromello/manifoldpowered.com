import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import useSWR from "swr";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Gamepad2,
  Loader2,
  QrCode,
} from "lucide-react";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";
import {
  purchaseAvailability,
  purchasePaymentLabels,
} from "lib/purchase-status";
import { GiftCardArtwork } from "components/store/GiftCardArtwork";
import type { BuyerCheckout } from "contracts/purchase-orders";

export async function checkoutRequest(
  url: string,
  body?: unknown,
): Promise<BuyerCheckout> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok)
    throw new Error("We could not complete this action. Try again.");
  return response.json();
}
type AppmaxScript = {
  init: (options: {
    externalId: string;
    onIp: (value: { ip: string }) => void;
    onTokenize: (value: { token: string }) => void;
    onError: () => void;
  }) => void | Promise<void>;
};
function AppmaxCardFields({
  externalId,
  scriptUrl,
  visible,
  disabled,
  onIp,
  onToken,
  onError,
  onBusy,
}: {
  externalId: string;
  scriptUrl: string;
  visible: boolean;
  disabled: boolean;
  onIp: (ip: string) => void;
  onToken: (token: string) => void;
  onError: () => void;
  onBusy: () => boolean;
}) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const callbacks = useRef({ onIp, onToken, onError });
  useEffect(() => {
    callbacks.current = { onIp, onToken, onError };
  }, [onIp, onToken, onError]);
  useEffect(() => {
    if (!loaded) return;
    const sdk = (window as Window & { AppmaxScripts?: AppmaxScript })
      .AppmaxScripts;
    try {
      if (!sdk) throw new Error();
      Promise.resolve(
        sdk.init({
          externalId,
          onIp: ({ ip }) => callbacks.current.onIp(ip),
          onTokenize: ({ token }) => callbacks.current.onToken(token),
          onError: () => callbacks.current.onError(),
        }),
      ).catch(() => callbacks.current.onError());
    } catch {
      callbacks.current.onError();
    }
  }, [externalId, loaded]);
  return (
    <>
      <form data-appmax-customer hidden />
      <Script
        id="appmax-checkout-sdk"
        src={scriptUrl}
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
        onError={onError}
      />
      <form
        data-appmax-checkout
        method="POST"
        onSubmitCapture={(event) => {
          event.preventDefault();
          if (disabled || !onBusy()) event.stopPropagation();
        }}
        onSubmit={(event) => event.preventDefault()}
        className={visible ? "mt-6 space-y-4" : "hidden"}
      >
        <label className="block text-sm text-white/70">
          {t("Card number")}
          <input
            name="card-number"
            required
            autoComplete="cc-number"
            inputMode="numeric"
            maxLength={23}
            className="checkout-input"
            disabled={disabled && !loaded}
          />
        </label>
        <label className="block text-sm text-white/70">
          {t("Name on card")}
          <input
            name="card-holder-name"
            required
            autoComplete="cc-name"
            maxLength={100}
            className="checkout-input"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm text-white/70">
            {t("Month")}
            <input
              name="exp-month"
              required
              autoComplete="cc-exp-month"
              inputMode="numeric"
              pattern="0?[1-9]|1[0-2]"
              maxLength={2}
              className="checkout-input"
            />
          </label>
          <label className="block text-sm text-white/70">
            {t("Year")}
            <input
              name="exp-year"
              required
              autoComplete="cc-exp-year"
              inputMode="numeric"
              pattern="[0-9]{2}|[0-9]{4}"
              maxLength={4}
              className="checkout-input"
            />
          </label>
          <label className="block text-sm text-white/70">
            CVV
            <input
              name="cvv"
              type="password"
              required
              autoComplete="cc-csc"
              inputMode="numeric"
              pattern="[0-9]{3,4}"
              maxLength={4}
              className="checkout-input"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={disabled || !loaded}
          className="checkout-primary"
        >
          {t("Confirm payment")}
        </button>
      </form>
    </>
  );
}

const money = (amount: number, currency: string) =>
  formatMoney((amount / 100).toFixed(2), currency);
function PixInstructions({
  pix,
}: {
  pix: NonNullable<NonNullable<BuyerCheckout["attempt"]>["pix"]>;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now()),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = pix.expires_at
    ? Math.max(0, Math.floor((Date.parse(pix.expires_at) - now) / 1000))
    : null;
  return (
    <section className="mt-6 rounded-xl border border-white/10 p-5 text-center">
      <h2 className="font-bold">{t("Pay with Pix")}</h2>
      <p className="mt-2 text-sm text-white/60">
        {t("Scan the QR code in your bank app or copy the Pix code.")}
      </p>
      {seconds === 0 ? (
        <p className="mt-5 text-amber-200">
          {t(
            "This Pix code has expired. Check your order before trying again.",
          )}
        </p>
      ) : (
        <>
          <Image
            src={`data:image/png;base64,${pix.qrcode}`}
            alt={t("Pix QR code")}
            width={240}
            height={240}
            unoptimized
            className="mx-auto mt-5 rounded-lg bg-white p-3"
          />
          {seconds !== null && (
            <p className="mt-3 text-sm text-white/60">
              {t("Expires in")} {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, "0")}
            </p>
          )}
          <textarea
            readOnly
            aria-label={t("Pix code")}
            value={pix.emv}
            className="mt-4 h-20 w-full resize-none rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/70"
          />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pix.emv);
                setCopied(true);
                setCopyError(false);
              } catch {
                setCopyError(true);
              }
            }}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-4 font-semibold hover:bg-white/5"
          >
            <Copy size={16} />
            {t(copied ? "Code copied" : "Copy Pix code")}
          </button>
          {copyError && (
            <p role="alert" className="mt-3 text-sm text-amber-200">
              {t("Could not copy. Select the code to copy it manually.")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function Checkout({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const {
    data: user,
    error: userError,
    isLoading: loadingUser,
  } = useSWR<{ id: string }>(
    "/api/v1/user",
    async (url) => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    { shouldRetryOnError: false },
  );
  const { data, error, isLoading, mutate } = useSWR<BuyerCheckout>(
    user ? [`/api/v1/orders/${orderId}`, user.id] : null,
    ([url]) => checkoutRequest(url),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
      refreshInterval: 10000,
    },
  );
  const [chosen, setChosen] = useState<"pix" | "card" | null>(null),
    [installments, setInstallments] = useState(1),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState<{
      id: string;
      method: string;
      installments: number;
      total: number;
    } | null>(null),
    [ip, setIp] = useState("");
  const buyerForm = useRef<HTMLFormElement>(null),
    inFlight = useRef(false),
    tokenTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    tokenizing = useRef(false);
  const method = chosen ?? data?.checkout.methods[0] ?? "pix";
  const { data: quotes, error: quoteError } = useSWR<{
    options: {
      installments: number;
      total_minor: number;
      interest_minor: number;
    }[];
  }>(
    data?.checkout.available && method === "card" && data.checkout.installments
      ? [`/api/v1/orders/${orderId}/quote`, user?.id]
      : null,
    async ([url]) => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );
  useEffect(
    () => () => {
      if (tokenTimer.current) clearTimeout(tokenTimer.current);
    },
    [],
  );
  const failedSdk = useCallback(() => {
    if (tokenTimer.current) clearTimeout(tokenTimer.current);
    inFlight.current = false;
    tokenizing.current = false;
    setBusy(false);
    setMessage(
      t("We could not prepare the payment. Reload the page and try again."),
    );
  }, [t]);
  const readBuyer = useCallback(() => {
    if (!buyerForm.current?.reportValidity()) return null;
    const fields = new FormData(buyerForm.current);
    return {
      first_name: String(fields.get("first_name") || ""),
      last_name: String(fields.get("last_name") || ""),
      phone: String(fields.get("phone") || "").replace(/\D/g, ""),
      document_number: String(fields.get("document_number") || "").replace(
        /\D/g,
        "",
      ),
      holder_document_number: String(
        fields.get("document_number") || "",
      ).replace(/\D/g, ""),
      holder_name:
        document
          .querySelector<HTMLInputElement>(
            'form[data-appmax-checkout] input[name="card-holder-name"]',
          )
          ?.value.trim() || undefined,
      ip,
    };
  }, [ip]);
  const sendPayment = useCallback(
    async (token?: string) => {
      tokenizing.current = false;
      if (tokenTimer.current) clearTimeout(tokenTimer.current);
      if (!data || !prepared || inFlight.current) return;
      const buyer = data.checkout.hosted ? undefined : readBuyer();
      if (!data.checkout.hosted && (!buyer || !ip)) {
        setMessage(t("Please check your purchase details."));
        setBusy(false);
        return;
      }
      inFlight.current = true;
      setBusy(true);
      setMessage("");
      if (tokenTimer.current) clearTimeout(tokenTimer.current);
      try {
        const result = await checkoutRequest(
          `/api/v1/orders/${orderId}/payment`,
          {
            attempt_id: prepared.id,
            expected_total_minor: prepared.total,
            ...(buyer ? { buyer } : {}),
            ...(token ? { card_token: token } : {}),
          },
        );
        await mutate(result, { revalidate: false });
        if (result.attempt?.checkout_url) {
          const url = new URL(result.attempt.checkout_url);
          if (url.origin !== "https://checkout.stripe.com") throw new Error();
          window.location.assign(url.href);
        }
        if (result.attempt?.uncertain)
          setMessage(
            t(
              "We are checking your payment. Check this order before trying again.",
            ),
          );
      } catch {
        setMessage(
          t(
            "We could not confirm your payment right now. Check your order before trying again.",
          ),
        );
        await mutate();
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [data, prepared, readBuyer, ip, t, orderId, mutate],
  );
  async function prepare() {
    if (!data || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await checkoutRequest(`/api/v1/orders/${orderId}/quote`, {
        method,
        installments: method === "pix" ? 1 : installments,
        idempotency_key: crypto.randomUUID(),
      });
      await mutate(result, { revalidate: false });
      if (result.attempt)
        setPrepared({
          id: result.attempt.id,
          method: result.attempt.method,
          installments: result.attempt.installments,
          total: result.attempt.total_minor,
        });
    } catch {
      setMessage(t("We could not prepare the payment. Try again."));
    } finally {
      setBusy(false);
    }
  }
  if (userError && ["401", "403"].includes(userError.message))
    return (
      <section className="py-16 text-center">
        <h1 className="text-2xl font-bold">
          {t("Log in to complete your purchase")}
        </h1>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/checkout/${orderId}`)}`}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-6 font-semibold hover:bg-violet-500"
        >
          {t("Log in")}
        </Link>
      </section>
    );
  if (error || userError)
    return (
      <p role="alert" className="py-16 text-center">
        {t("We could not load this order. Check My orders and try again.")}
      </p>
    );
  if (loadingUser || isLoading || !data)
    return (
      <p role="status" className="flex items-center gap-2 py-20">
        <Loader2 className="animate-spin" />
        {t("Loading your order")}
      </p>
    );
  const order = data.order,
    attempt = data.attempt,
    submitted = Boolean(
      attempt?.submitted &&
      !(
        ["FAILED", "CANCELLED"].includes(order.payment_status) &&
        !attempt.uncertain
      ),
    );
  const payDisabled =
    busy ||
    !data.checkout.available ||
    !prepared ||
    prepared.method !== method ||
    prepared.installments !== (method === "pix" ? 1 : installments) ||
    !ip;
  const option = quotes?.options.find(
    (option) => option.installments === installments,
  );
  return (
    <>
      <header className="py-8">
        <h1 className="text-3xl font-black sm:text-4xl">
          {t("Complete your purchase")}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {t("Review your order and choose how to pay.")}
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border border-white/10 bg-[#110d18] p-5 sm:p-7">
          {message && (
            <p
              role="alert"
              className="mb-5 rounded-lg bg-amber-400/10 p-4 text-sm text-amber-100"
            >
              {message}
            </p>
          )}
          {order.payment_status === "PAID" ? (
            <>
              <CheckCircle2 className="text-emerald-300" size={32} />
              <h2 className="mt-4 text-xl font-bold">
                {t("Payment confirmed")}
              </h2>
              <p className="mt-2 text-sm text-white/60">
                {t(
                  purchaseAvailability(
                    order.item_type,
                    order.payment_status,
                    order.delivery_status,
                  ),
                )}
              </p>
              <Link
                href={
                  order.item_type === "GAME"
                    ? "/library"
                    : `/library/gift-cards?order=${order.gift_card_order_id}`
                }
                className="checkout-primary mt-6"
              >
                {t(
                  order.item_type === "GAME"
                    ? "Go to library"
                    : "My gift cards",
                )}
              </Link>
            </>
          ) : submitted ? (
            <>
              <Clock3 className="text-violet-300" />
              <h2 className="mt-4 text-xl font-bold">
                {t(
                  purchasePaymentLabels[order.payment_status] ??
                    "Purchase under review",
                )}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {t(
                  attempt?.uncertain
                    ? "We are checking your payment. Check this order before trying again."
                    : "Your product will be available after payment confirmation.",
                )}
              </p>
              {attempt?.pix && <PixInstructions pix={attempt.pix} />}{" "}
              {attempt?.checkout_url && (
                <a
                  href={attempt.checkout_url}
                  className="checkout-primary mt-6"
                >
                  {t("Continue purchase")}
                </a>
              )}
              <button
                className="mt-5 text-sm text-violet-200 underline underline-offset-4"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await checkoutRequest(`/api/v1/orders/${orderId}`, {
                      action: "reconcile",
                    });
                    await mutate();
                  } catch {
                    setMessage(
                      t("We could not complete this action. Try again."),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Check payment status")}
              </button>
            </>
          ) : order.payment_status === "CANCELLED" ||
            ["REFUNDED", "DISPUTED"].includes(order.payment_status) ? (
            <>
              <h2 className="text-xl font-bold">
                {t(purchasePaymentLabels[order.payment_status])}
              </h2>
              <Link href="/library/orders" className="checkout-primary mt-6">
                {t("My orders")}
              </Link>
            </>
          ) : !data.checkout.available ? (
            <p role="status" className="text-sm text-white/60">
              {t(
                "New purchases are temporarily unavailable. Please try again later.",
              )}
            </p>
          ) : (
            <>
              {!data.checkout.hosted && (
                <form
                  ref={buyerForm}
                  onSubmit={(event) => event.preventDefault()}
                  className="space-y-4"
                >
                  <h2 className="text-lg font-bold">{t("Your details")}</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm text-white/70">
                      {t("First name")}
                      <input
                        name="first_name"
                        autoComplete="given-name"
                        required
                        maxLength={80}
                        className="checkout-input"
                      />
                    </label>
                    <label className="text-sm text-white/70">
                      {t("Last name")}
                      <input
                        name="last_name"
                        autoComplete="family-name"
                        required
                        maxLength={80}
                        className="checkout-input"
                      />
                    </label>
                  </div>
                  <label className="block text-sm text-white/70">
                    {t("Phone number")}
                    <input
                      name="phone"
                      autoComplete="tel-national"
                      inputMode="tel"
                      required
                      pattern="[0-9 ()+-]{10,18}"
                      maxLength={18}
                      className="checkout-input"
                    />
                  </label>
                  <label className="block text-sm text-white/70">
                    CPF / CNPJ
                    <input
                      name="document_number"
                      inputMode="numeric"
                      required
                      pattern="[0-9./-]{11,18}"
                      maxLength={18}
                      className="checkout-input"
                    />
                  </label>
                </form>
              )}
              <h2 className="mb-4 mt-7 text-lg font-bold">
                {t("Payment method")}
              </h2>
              <div className="flex gap-3">
                {data.checkout.methods.map((value) => (
                  <button
                    key={value}
                    aria-pressed={method === value}
                    onClick={() => {
                      setChosen(value);
                      setInstallments(1);
                      setPrepared(null);
                      setMessage("");
                    }}
                    disabled={busy}
                    className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${method === value ? "border-violet-400/50 bg-violet-500/15 text-violet-200" : "border-white/10 text-white/60 hover:bg-white/5"}`}
                  >
                    {value === "pix" ? (
                      <QrCode size={17} />
                    ) : (
                      <CreditCard size={17} />
                    )}{" "}
                    {t(value === "pix" ? "Pix" : "Credit card")}
                  </button>
                ))}
              </div>
              {method === "card" && data.checkout.installments && (
                <label className="mt-5 block text-sm text-white/70">
                  {t("Installments")}
                  <select
                    value={installments}
                    onChange={(event) => {
                      setInstallments(Number(event.target.value));
                      setPrepared(null);
                    }}
                    className="checkout-input"
                  >
                    <option value={1}>{t("Pay in full")}</option>
                    {quotes?.options
                      .filter((option) => option.installments > 1)
                      .map((option) => (
                        <option
                          key={option.installments}
                          value={option.installments}
                        >
                          {option.installments}x ·{" "}
                          {money(
                            Math.ceil(option.total_minor / option.installments),
                            order.currency,
                          )}{" "}
                          · {t("Total")}:{" "}
                          {money(option.total_minor, order.currency)}
                        </option>
                      ))}
                  </select>
                  {quoteError && (
                    <span
                      role="alert"
                      className="mt-2 block text-xs text-amber-200"
                    >
                      {t("Installment options are temporarily unavailable.")}
                    </span>
                  )}
                </label>
              )}
              {method === "card" && option && (
                <p className="mt-3 text-xs text-white/50">
                  {t("Installment interest")}:{" "}
                  {money(option.interest_minor, order.currency)}
                </p>
              )}
              <button
                onClick={prepare}
                disabled={
                  busy ||
                  Boolean(method === "card" && installments > 1 && !option)
                }
                className="mt-5 min-h-11 w-full rounded-lg border border-white/15 px-4 text-sm font-semibold hover:bg-white/5 disabled:opacity-40"
              >
                {t(busy ? "Please wait" : "Review payment")}
              </button>
              {prepared && (
                <div className="mt-5 rounded-xl bg-violet-500/10 p-4">
                  <p className="text-sm text-white/70">{t("Order total")}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {money(prepared.total, order.currency)}
                  </p>
                  {prepared.installments > 1 && (
                    <p className="mt-2 text-sm text-white/60">
                      {prepared.installments}x · {t("Installment interest")}:{" "}
                      {money(
                        prepared.total - order.amount_minor,
                        order.currency,
                      )}
                    </p>
                  )}
                </div>
              )}
              {data.checkout.hosted ? (
                <button
                  onClick={() => sendPayment()}
                  disabled={busy || !prepared}
                  className="checkout-primary mt-6"
                >
                  {t("Confirm payment")}
                </button>
              ) : (
                <>
                  <AppmaxCardFields
                    externalId={data.checkout.external_id!}
                    scriptUrl={data.checkout.script_url!}
                    visible={method === "card"}
                    disabled={payDisabled}
                    onIp={setIp}
                    onToken={sendPayment}
                    onError={failedSdk}
                    onBusy={() => {
                      if (tokenizing.current || inFlight.current) return false;
                      if (!readBuyer()) return false;
                      tokenizing.current = true;
                      setBusy(true);
                      tokenTimer.current = setTimeout(failedSdk, 20000);
                      return true;
                    }}
                  />
                  {method === "pix" && (
                    <button
                      onClick={() => sendPayment()}
                      disabled={payDisabled}
                      className="checkout-primary mt-6"
                    >
                      {t("Generate Pix code")}
                    </button>
                  )}
                </>
              )}
              {busy && (
                <p
                  role="status"
                  className="mt-4 flex items-center gap-2 text-sm text-white/60"
                >
                  <Loader2 size={16} className="animate-spin" />
                  {t("Processing your payment")}
                </p>
              )}
            </>
          )}
          {order.can_cancel && (
            <button
              className="mt-6 text-sm text-white/50 underline underline-offset-4 hover:text-white disabled:opacity-40"
              disabled={busy}
              onClick={async () => {
                if (inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                setMessage("");
                try {
                  const result = await checkoutRequest(
                    `/api/v1/orders/${orderId}`,
                    { action: "cancel" },
                  );
                  await mutate(result, { revalidate: false });
                } catch {
                  setMessage(
                    t(
                      "We could not cancel this order. Check your payment status.",
                    ),
                  );
                  await mutate();
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              {t("Cancel order")}
            </button>
          )}
        </section>
        <aside className="order-first rounded-2xl border border-white/10 bg-[#110d18] p-5 lg:order-last">
          <div
            className={`relative mb-4 aspect-video overflow-hidden rounded-lg ${order.item_id === "sandbox-brl-25" ? "bg-[#e60012]" : "bg-[#1b2838]"}`}
          >
            {order.item_type === "GIFT_CARD" ? (
              <GiftCardArtwork
                productCode={order.item_id}
                sizes={order.item_id === "sandbox-brl-25" ? "1600px" : "340px"}
              />
            ) : order.image_url ? (
              <Image
                src={order.image_url}
                alt={order.product_name}
                fill
                sizes="340px"
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-white/35">
                <Gamepad2 size={48} />
              </div>
            )}
          </div>
          <h2 className="font-bold">{order.product_name}</h2>
          <p className="mt-2 text-sm text-white/50">
            {t(order.item_type === "GAME" ? "Game" : "Gift card")}
          </p>
          <dl className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">{t("Product price")}</dt>
              <dd className="font-bold">
                {money(order.amount_minor, order.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">{t("Installment interest")}</dt>
              <dd>{money(attempt?.interest_minor ?? 0, order.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
              <dt className="font-semibold">{t("Order total")}</dt>
              <dd className="font-bold">
                {money(
                  attempt?.total_minor ?? order.amount_minor,
                  order.currency,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">{t("Payment")}</dt>
              <dd>{t(purchasePaymentLabels[order.payment_status])}</dd>
            </div>
          </dl>
          <Link
            href="/library/orders"
            className="mt-6 inline-flex text-sm text-violet-200 hover:text-white"
          >
            {t("My orders")}
          </Link>
        </aside>
      </div>
      <style jsx global>{`
        .checkout-input {
          display: block;
          width: 100%;
          min-height: 44px;
          margin-top: 8px;
          padding: 10px 12px;
          border: 1px solid rgb(255 255 255/0.12);
          border-radius: 8px;
          background: #171120;
          color: white;
          outline: none;
        }
        .checkout-input:focus {
          border-color: #a78bfa;
          box-shadow: 0 0 0 2px rgb(167 139 250/0.15);
        }
        .checkout-primary {
          display: inline-flex;
          min-height: 44px;
          width: 100%;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #7c3aed;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 700;
          color: white;
          transition: background 0.15s;
        }
        .checkout-primary:hover {
          background: #8b5cf6;
        }
        .checkout-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
