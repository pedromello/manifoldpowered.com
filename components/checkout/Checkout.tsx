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
  Mail,
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

const digits = (value: string) => value.replace(/\D/g, "");
const normalizeDigits = (event: React.FormEvent<HTMLInputElement>) => {
  event.currentTarget.value = digits(event.currentTarget.value);
};
const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

type RecipientConfirmation = {
  first_name: string;
  last_name: string;
  document?: string;
  confirmed: true;
};

export function GiftCardRecipient({
  delivery,
  busy,
  onConfirm,
  orderId,
}: {
  delivery: NonNullable<BuyerCheckout["gift_card_delivery"]>;
  busy: boolean;
  onConfirm: (recipient: RecipientConfirmation) => Promise<void>;
  orderId: string;
}) {
  const { t } = useI18n();
  if (delivery.verification_required || !delivery.email)
    return (
      <div role="status" className="space-y-4 text-sm text-white/70">
        <p>{t("Verify your account email before confirming delivery.")}</p>
        <p>
          {t(
            "If your account email has changed, cancel this order and start a new purchase.",
          )}
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/checkout/${orderId}`)}`}
          className="checkout-primary"
        >
          {t("Verify email")}
        </Link>
      </div>
    );
  return (
    <form
      className="space-y-5"
      method="POST"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !event.currentTarget.reportValidity()) return;
        const fields = new FormData(event.currentTarget);
        const document = delivery.document_required
          ? digits(String(fields.get("recipient_document") || ""))
          : "";
        const firstName = String(
          fields.get("recipient_first_name") || "",
        ).trim();
        const lastName = String(fields.get("recipient_last_name") || "").trim();
        if (
          !firstName ||
          !lastName ||
          (delivery.document_required && !document)
        )
          return;
        await onConfirm({
          first_name: firstName,
          last_name: lastName,
          ...(document ? { document } : {}),
          confirmed: true,
        });
      }}
    >
      <h2 className="text-lg font-bold">{t("Gift card delivery")}</h2>
      <DeliveryEmail email={delivery.email} />
      <fieldset disabled={busy}>
        <legend className="mb-2 font-semibold">{t("Recipient")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-sm text-white/70">
            {t("First name")}
            <input
              name="recipient_first_name"
              autoComplete="section-delivery given-name"
              required
              maxLength={80}
              className="checkout-input"
            />
          </label>
          <label className="min-w-0 text-sm text-white/70">
            {t("Last name")}
            <input
              name="recipient_last_name"
              autoComplete="section-delivery family-name"
              required
              maxLength={80}
              className="checkout-input"
            />
          </label>
        </div>
      </fieldset>
      {delivery.document_required && (
        <label className="block text-sm text-white/70">
          {t("Recipient document")}
          <input
            name="recipient_document"
            inputMode="numeric"
            autoComplete="off"
            required
            pattern="[0-9]{11}|[0-9]{14}"
            maxLength={18}
            onInput={normalizeDigits}
            disabled={busy}
            className="checkout-input"
          />
        </label>
      )}
      <button type="submit" disabled={busy} className="checkout-primary">
        {t(busy ? "Please wait" : "Confirm delivery and continue")}
      </button>
    </form>
  );
}

function DeliveryEmail({ email }: { email: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3">
      <Mail aria-hidden="true" size={18} className="shrink-0 text-violet-300" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-white/60">
          {t("Delivery email")}
        </p>
        <p className="mt-0.5 break-words text-sm font-medium">{email}</p>
      </div>
    </div>
  );
}

function recipientConfirmed(data: BuyerCheckout) {
  const delivery = data.gift_card_delivery;
  return (
    delivery?.channel !== "EMAIL" ||
    (Boolean(delivery.email) &&
      delivery.confirmed &&
      delivery.recipient_ready &&
      !delivery.verification_required)
  );
}

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
  total,
  onIp,
  onHolderNameChange,
  onToken,
  onError,
  onStart,
}: {
  externalId: string;
  scriptUrl: string;
  visible: boolean;
  disabled: boolean;
  total: string;
  onIp: (ip: string) => void;
  onHolderNameChange: (name: string) => void;
  onToken: (token: string) => void;
  onError: () => void;
  onStart: (holderName: string) => boolean;
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
          const holderInput =
            event.currentTarget.elements.namedItem("card-holder-name");
          const holderName =
            holderInput instanceof HTMLInputElement
              ? holderInput.value.trim()
              : "";
          if (disabled || !onStart(holderName)) event.stopPropagation();
        }}
        onSubmit={(event) => event.preventDefault()}
        className={visible ? "mt-6 space-y-4" : "hidden"}
      >
        <label className="checkout-muted block text-sm">
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
        <label className="checkout-muted block text-sm">
          {t("Name on card")}
          <input
            name="card-holder-name"
            required
            autoComplete="cc-name"
            onChange={(event) => onHolderNameChange(event.target.value)}
            maxLength={100}
            className="checkout-input"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="checkout-muted block min-w-0 text-sm">
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
          <label className="checkout-muted block min-w-0 text-sm">
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
          <label className="checkout-muted block min-w-0 text-sm">
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
          {t("Pay {amount}", { amount: total })}
        </button>
      </form>
    </>
  );
}

const money = (amount: number, currency: string) =>
  formatMoney((amount / 100).toFixed(2), currency);

type PaymentMethod = BuyerCheckout["checkout"]["methods"][number];

export function quoteForSelection(
  data: BuyerCheckout | undefined,
  method: PaymentMethod,
  installments: number,
) {
  const attempt = data?.attempt;
  return data?.order.payment_status === "UNPAID" &&
    attempt &&
    !attempt.submitted &&
    !attempt.uncertain &&
    attempt.method === method &&
    attempt.installments === installments &&
    Date.parse(attempt.quote_expires_at) > Date.now()
    ? attempt
    : null;
}

function readBuyerForm(form: HTMLFormElement | null, ip: string) {
  if (!form?.reportValidity()) return null;
  const fields = new FormData(form);
  return {
    first_name: String(fields.get("first_name") || "").trim(),
    last_name: String(fields.get("last_name") || "").trim(),
    phone: digits(String(fields.get("phone") || "")),
    ...(fields.get("reuse_recipient_document") === "on"
      ? { reuse_recipient_document: true }
      : {
          document_number: digits(String(fields.get("document_number") || "")),
        }),
    ip,
  };
}
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
    <section className="mt-5 text-center">
      <h3 className="font-bold">{t("Pay with Pix")}</h3>
      {seconds === 0 ? (
        <p role="status" className="checkout-warning mt-3 text-sm">
          {t(
            "This Pix code has expired. Check your order before trying again.",
          )}
        </p>
      ) : (
        <>
          <p className="checkout-muted mt-1 text-sm">
            {t("Scan the QR code in your bank app or copy the Pix code.")}
          </p>
          <Image
            src={`data:image/png;base64,${pix.qrcode}`}
            alt={t("Pix QR code")}
            width={200}
            height={200}
            unoptimized
            className="mx-auto mt-4 h-auto max-w-full rounded-lg bg-white p-3"
          />
          {seconds !== null && (
            <p className="checkout-muted mt-3 text-sm">
              {t("Expires in")} {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, "0")}
            </p>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pix.emv);
                setCopied(true);
                setCopyError(false);
              } catch {
                setCopied(false);
                setCopyError(true);
              }
            }}
            className="checkout-primary mt-4 gap-2"
          >
            <Copy aria-hidden="true" size={16} />
            <span aria-live="polite">
              {t(copied ? "Code copied" : "Copy Pix code")}
            </span>
          </button>
          {copyError && (
            <p role="alert" className="checkout-warning mt-2 text-sm">
              {t("Could not copy. Select the code to copy it manually.")}
            </p>
          )}
          <details open={copyError || undefined} className="mt-2">
            <summary className="checkout-accent mx-auto cursor-pointer rounded px-2 py-2 text-sm focus-visible:outline-2">
              {t("Pix code")}
            </summary>
            <textarea
              readOnly
              aria-label={t("Pix code")}
              value={pix.emv}
              className="checkout-input text-xs"
            />
          </details>
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
  const [choice, setChoice] = useState<{
      method: PaymentMethod;
      installments: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [statusMessage, setStatusMessage] = useState(""),
    [documentChoice, setDocumentChoice] = useState<{
      reuse: boolean;
      cardholder: string;
    }>(),
    [cardHolderName, setCardHolderName] = useState(""),
    [payerName, setPayerName] = useState<{
      firstName: string;
      lastName: string;
    }>(),
    [sdkFailed, setSdkFailed] = useState(false),
    [ip, setIp] = useState("");
  const buyerForm = useRef<HTMLFormElement>(null),
    paymentHeading = useRef<HTMLHeadingElement>(null),
    focusPayment = useRef(false),
    inFlight = useRef(false),
    tokenTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pendingCard = useRef<{
      buyer: NonNullable<ReturnType<typeof readBuyerForm>> & {
        holder_name: string;
      };
      installments: number;
      reviewedTotal: number;
    } | null>(null);
  const paymentReady = Boolean(data && recipientConfirmed(data));
  const canReuseDocument = Boolean(
    paymentReady && data?.gift_card_delivery?.document_required,
  );
  const method =
    choice?.method ??
    (data?.attempt?.method === "card" && data.checkout.methods.includes("card")
      ? "card"
      : (data?.checkout.methods[0] ?? "pix"));
  const recipientFirstName =
    data?.gift_card_delivery?.recipient_first_name ?? "";
  const recipientLastName = data?.gift_card_delivery?.recipient_last_name ?? "";
  const prefillPayer = Boolean(
    paymentReady && recipientFirstName && recipientLastName,
  );
  const firstName = payerName?.firstName ?? recipientFirstName;
  const lastName = payerName?.lastName ?? recipientLastName;
  const differentPayer =
    prefillPayer &&
    (normalizeName(firstName) !== normalizeName(recipientFirstName) ||
      normalizeName(lastName) !== normalizeName(recipientLastName));
  const payerFullName = normalizeName(`${firstName} ${lastName}`);
  const cardholder = normalizeName(cardHolderName);
  const differentCardholder =
    method === "card" && Boolean(cardholder && cardholder !== payerFullName);
  const reuseRecipientDocument =
    canReuseDocument &&
    !differentPayer &&
    (differentCardholder
      ? documentChoice?.reuse === true &&
        documentChoice.cardholder === cardholder
      : (documentChoice?.reuse ?? prefillPayer));
  const installments =
    method === "card"
      ? (choice?.installments ?? data?.attempt?.installments ?? 1)
      : 1;
  const {
    data: quotes,
    error: quoteError,
    isLoading: quoteLoading,
  } = useSWR<{
    options: {
      installments: number;
      total_minor: number;
      interest_minor: number;
    }[];
  }>(
    paymentReady &&
      data?.order.can_pay &&
      data.checkout.available &&
      method === "card" &&
      data.checkout.installments
      ? [`/api/v1/orders/${orderId}/quote`, user?.id]
      : null,
    async ([url]) => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );
  const option = quotes?.options.find(
    (item) => item.installments === installments,
  );
  const activeQuote = quoteForSelection(data, method, installments);
  const displayedTotal =
    activeQuote?.total_minor ??
    option?.total_minor ??
    data?.order.amount_minor ??
    0;
  useEffect(() => {
    if (!paymentReady || !focusPayment.current) return;
    focusPayment.current = false;
    paymentHeading.current?.focus();
  }, [paymentReady]);
  useEffect(
    () => () => {
      if (tokenTimer.current) clearTimeout(tokenTimer.current);
    },
    [],
  );
  const failedSdk = useCallback(
    (timedOut = false) => {
      if (inFlight.current) return;
      if (tokenTimer.current) clearTimeout(tokenTimer.current);
      const reload = timedOut || !pendingCard.current;
      pendingCard.current = null;
      if (reload) setSdkFailed(true);
      setBusy(false);
      setMessage(
        t(
          reload
            ? "We could not prepare the payment. Reload the page and try again."
            : "We could not read your card. Check the details and try again.",
        ),
      );
    },
    [t],
  );
  const sendPayment = useCallback(
    async (token?: string) => {
      if (inFlight.current || (token && !pendingCard.current)) return;
      const card = token ? pendingCard.current : null;
      pendingCard.current = null;
      if (tokenTimer.current) clearTimeout(tokenTimer.current);
      if (!data?.order.can_pay || !paymentReady) {
        setBusy(false);
        return;
      }
      if (card && (method !== "card" || card.installments !== installments)) {
        setMessage(t("Please confirm your payment option again."));
        setBusy(false);
        return;
      }
      const buyer = data.checkout.hosted
        ? undefined
        : token
          ? card?.buyer
          : readBuyerForm(buyerForm.current, ip);
      if (!data.checkout.hosted && (!buyer || !ip)) {
        setBusy(false);
        return;
      }
      inFlight.current = true;
      setBusy(true);
      setMessage("");
      const reviewedTotal = card?.reviewedTotal ?? displayedTotal;
      try {
        let quote = quoteForSelection(data, method, installments);
        if (!quote) {
          const reviewed = await checkoutRequest(
            `/api/v1/orders/${orderId}/quote`,
            {
              method,
              installments,
              idempotency_key: crypto.randomUUID(),
            },
          );
          await mutate(reviewed, { revalidate: false });
          quote = quoteForSelection(reviewed, method, installments);
        }
        if (!quote) throw new Error();
        if (quote.total_minor !== reviewedTotal) {
          setMessage(
            t("The total changed. Review the new amount and confirm again."),
          );
          return;
        }
        const result = await checkoutRequest(
          `/api/v1/orders/${orderId}/payment`,
          {
            attempt_id: quote.id,
            expected_total_minor: reviewedTotal,
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
    [
      data,
      paymentReady,
      ip,
      method,
      installments,
      displayedTotal,
      t,
      orderId,
      mutate,
    ],
  );
  async function confirmRecipient(recipient: RecipientConfirmation) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await checkoutRequest(
        `/api/v1/orders/${orderId}/recipient`,
        recipient,
      );
      focusPayment.current = recipientConfirmed(result);
      await mutate(result, { revalidate: false });
    } catch {
      setMessage(
        t(
          "We could not confirm delivery details. Check your name and document and try again.",
        ),
      );
      await mutate();
    } finally {
      inFlight.current = false;
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
    !order.can_pay ||
    !paymentReady ||
    !data.checkout.available ||
    (!data.checkout.hosted && (!ip || sdkFailed)) ||
    (method === "card" &&
      !activeQuote &&
      (quoteLoading || (installments > 1 && !option)));
  const showingPaymentChoices =
    order.can_pay && paymentReady && data.checkout.available && !submitted;
  const appmaxPaymentPanel =
    !data.checkout.hosted &&
    order.payment_status !== "PAID" &&
    (showingPaymentChoices || submitted);
  const total = showingPaymentChoices
    ? displayedTotal
    : submitted || order.payment_status === "PAID"
      ? (attempt?.total_minor ?? order.total_minor)
      : order.amount_minor;
  const interest = total - order.amount_minor;
  const deliveryEmail = data.gift_card_delivery?.email;
  return (
    <>
      <header className="py-6 sm:py-8">
        <h1 className="text-3xl font-black sm:text-4xl">
          {t("Complete your purchase")}
        </h1>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <aside className="min-w-0 rounded-2xl border border-white/10 bg-[#110d18] p-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:p-5">
          <div className="flex items-center gap-3">
            <div
              className={`relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-lg sm:w-20 ${order.item_id === "sandbox-brl-25" ? "bg-[#e60012]" : "bg-[#1b2838]"}`}
            >
              {order.item_type === "GIFT_CARD" ? (
                <GiftCardArtwork productCode={order.item_id} sizes="80px" />
              ) : order.image_url ? (
                <Image
                  src={order.image_url}
                  alt=""
                  fill
                  sizes="80px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/60">
                  <Gamepad2 aria-hidden="true" size={24} />
                </div>
              )}
            </div>
            <h2 className="min-w-0 break-words text-sm font-bold sm:text-base">
              {order.product_name}
            </h2>
          </div>
          <dl className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm">
            {interest > 0 && (
              <div className="flex justify-between gap-3 text-white/70">
                <dt>{t("Installment interest")}</dt>
                <dd className="shrink-0">{money(interest, order.currency)}</dd>
              </div>
            )}
            <div
              className="flex items-baseline justify-between gap-3"
              aria-live="polite"
            >
              <dt className="font-medium text-white/70">{t("Order total")}</dt>
              <dd className="shrink-0 text-lg font-bold tabular-nums">
                {money(total, order.currency)}
              </dd>
            </div>
          </dl>
          {appmaxPaymentPanel && showingPaymentChoices && deliveryEmail && (
            <div className="mt-3">
              <DeliveryEmail email={deliveryEmail} />
            </div>
          )}
        </aside>
        <section
          className={`min-w-0 rounded-2xl border border-white/10 p-5 sm:p-7 lg:col-start-1 lg:row-start-1 ${appmaxPaymentPanel ? "checkout-payment-panel" : "bg-[#110d18]"}`}
        >
          {message && (
            <p
              role="alert"
              className="checkout-alert mb-5 rounded-lg p-4 text-sm"
            >
              {message}
            </p>
          )}
          {!message && order.payment_status === "FAILED" && (
            <p
              role="alert"
              className="checkout-alert mb-4 rounded-lg p-3 text-sm"
            >
              {t("Payment failed. Check your details or try another method.")}
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
                    data.gift_card_delivery?.channel,
                  ),
                )}
              </p>
              {deliveryEmail && (
                <div className="mt-4">
                  <DeliveryEmail email={deliveryEmail} />
                </div>
              )}
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
              <Clock3 className="checkout-accent" />
              <h2 className="mt-4 text-xl font-bold">
                {t(
                  purchasePaymentLabels[order.payment_status] ??
                    "Purchase under review",
                )}
              </h2>
              {attempt?.uncertain ? (
                <p className="checkout-muted mt-3 text-sm leading-6">
                  {t(
                    "We are checking your payment. Check this order before trying again.",
                  )}
                </p>
              ) : attempt?.pix ? (
                <PixInstructions pix={attempt.pix} />
              ) : (
                <p className="checkout-muted mt-3 text-sm leading-6">
                  {t(
                    "Your product will be available after payment confirmation.",
                  )}
                </p>
              )}
              {attempt?.checkout_url && recipientConfirmed(data) && (
                <a
                  href={attempt.checkout_url}
                  className="checkout-primary mt-6"
                >
                  {t("Continue purchase")}
                </a>
              )}
              <button
                type="button"
                className="checkout-accent mt-4 min-h-11 rounded-lg px-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 disabled:opacity-50"
                disabled={busy}
                onClick={async () => {
                  if (inFlight.current) return;
                  inFlight.current = true;
                  setBusy(true);
                  setMessage("");
                  setStatusMessage("");
                  try {
                    const refreshed = await checkoutRequest(
                      `/api/v1/orders/${orderId}`,
                      {
                        action: "reconcile",
                      },
                    );
                    await mutate(refreshed, { revalidate: false });
                    setStatusMessage(t("Payment check requested."));
                  } catch {
                    setMessage(
                      t("We could not complete this action. Try again."),
                    );
                  } finally {
                    inFlight.current = false;
                    setBusy(false);
                  }
                }}
              >
                {t(busy ? "Please wait" : "Check payment status")}
              </button>
              {statusMessage && (
                <p role="status" className="checkout-muted text-sm">
                  {statusMessage}
                </p>
              )}
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
          ) : !recipientConfirmed(data) && data.gift_card_delivery ? (
            <GiftCardRecipient
              delivery={data.gift_card_delivery}
              busy={busy}
              orderId={orderId}
              onConfirm={confirmRecipient}
            />
          ) : (
            <>
              {deliveryEmail && !appmaxPaymentPanel && (
                <div className="mb-6">
                  <DeliveryEmail email={deliveryEmail} />
                </div>
              )}
              <h2
                ref={paymentHeading}
                tabIndex={-1}
                id="checkout-method"
                className="mb-3 scroll-mt-24 text-lg font-bold"
              >
                {t("Payment method")}
              </h2>
              <div
                role="group"
                aria-labelledby="checkout-method"
                className="mb-5 flex flex-wrap gap-2"
              >
                {data.checkout.methods.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={method === value}
                    onClick={() => {
                      if (value === method) return;
                      setChoice({ method: value, installments: 1 });
                      if (!sdkFailed) setMessage("");
                    }}
                    disabled={busy}
                    className="checkout-method flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold sm:px-3"
                  >
                    {value === "pix" ? (
                      <QrCode
                        aria-hidden="true"
                        size={17}
                        className="shrink-0"
                      />
                    ) : (
                      <CreditCard
                        aria-hidden="true"
                        size={17}
                        className="shrink-0"
                      />
                    )}{" "}
                    {t(value === "pix" ? "Pix" : "Credit card")}
                  </button>
                ))}
              </div>
              {method === "card" && data.checkout.installments && (
                <label className="checkout-muted mb-6 block text-sm">
                  {t("Installments")}
                  <select
                    value={installments}
                    disabled={busy}
                    onChange={(event) => {
                      setChoice({
                        method,
                        installments: Number(event.target.value),
                      });
                      if (!sdkFailed) setMessage("");
                    }}
                    className="checkout-input"
                  >
                    <option value={1}>{t("Pay in full")}</option>
                    {Array.from(
                      new Set([
                        ...(quotes?.options.map((item) => item.installments) ??
                          []),
                        installments,
                      ]),
                    )
                      .filter((count) => count > 1)
                      .sort((left, right) => left - right)
                      .map((count) => {
                        const quote =
                          count === installments && activeQuote
                            ? activeQuote
                            : quotes?.options.find(
                                (item) => item.installments === count,
                              );
                        return (
                          <option key={count} value={count}>
                            {count}x
                            {quote
                              ? ` · ${t("Total")} ${money(quote.total_minor, order.currency)}`
                              : ""}
                          </option>
                        );
                      })}
                  </select>
                  {quoteLoading && !activeQuote && (
                    <span
                      role="status"
                      className="checkout-muted mt-2 block text-xs"
                    >
                      {t("Loading installments")}
                    </span>
                  )}
                  {quoteError && (
                    <span
                      role="alert"
                      className="checkout-warning mt-2 block text-xs"
                    >
                      {t("Installment options are temporarily unavailable.")}
                    </span>
                  )}
                </label>
              )}
              {!data.checkout.hosted && (
                <form
                  ref={buyerForm}
                  method="POST"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (method === "pix" && !payDisabled) void sendPayment();
                  }}
                >
                  <fieldset disabled={busy} className="space-y-4">
                    <legend className="mb-3 text-base font-bold">
                      {t("Payer details")}
                    </legend>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="checkout-muted min-w-0 text-sm">
                        {t("First name")}
                        <input
                          name="first_name"
                          autoComplete="section-payment given-name"
                          value={firstName}
                          onChange={(event) =>
                            setPayerName({
                              firstName: event.target.value,
                              lastName,
                            })
                          }
                          required
                          maxLength={80}
                          className="checkout-input"
                        />
                      </label>
                      <label className="checkout-muted min-w-0 text-sm">
                        {t("Last name")}
                        <input
                          name="last_name"
                          autoComplete="section-payment family-name"
                          value={lastName}
                          onChange={(event) =>
                            setPayerName({
                              firstName,
                              lastName: event.target.value,
                            })
                          }
                          required
                          maxLength={80}
                          className="checkout-input"
                        />
                      </label>
                    </div>
                    {prefillPayer && (
                      <p className="checkout-muted text-sm">
                        {t("You can edit the payer details.")}
                      </p>
                    )}
                    <label className="checkout-muted block text-sm">
                      {t("Phone number")}
                      <input
                        name="phone"
                        autoComplete="section-payment tel-national"
                        inputMode="tel"
                        required
                        pattern="[0-9]{10,11}"
                        onInput={normalizeDigits}
                        maxLength={18}
                        className="checkout-input"
                      />
                    </label>
                    {canReuseDocument && (
                      <label className="checkout-muted flex min-h-11 items-center gap-3 text-sm font-medium">
                        <input
                          name="reuse_recipient_document"
                          type="checkbox"
                          checked={reuseRecipientDocument}
                          disabled={differentPayer}
                          onChange={(event) =>
                            setDocumentChoice({
                              reuse: event.target.checked,
                              cardholder,
                            })
                          }
                          className="size-4 shrink-0 accent-violet-500"
                        />
                        {t("Use the delivery document for payment")}
                      </label>
                    )}
                    {!reuseRecipientDocument && (
                      <label className="checkout-muted block text-sm">
                        {t(
                          method === "card"
                            ? "Cardholder document"
                            : "CPF or CNPJ",
                        )}
                        <input
                          name="document_number"
                          inputMode="numeric"
                          autoComplete="off"
                          required
                          pattern="[0-9]{11}|[0-9]{14}"
                          maxLength={18}
                          onInput={normalizeDigits}
                          className="checkout-input"
                        />
                      </label>
                    )}
                  </fieldset>
                </form>
              )}
              {data.checkout.hosted ? (
                <button
                  type="button"
                  onClick={() => sendPayment()}
                  disabled={payDisabled}
                  className="checkout-primary"
                >
                  {t("Continue to payment")}
                </button>
              ) : (
                <>
                  <AppmaxCardFields
                    externalId={data.checkout.external_id!}
                    scriptUrl={data.checkout.script_url!}
                    visible={method === "card"}
                    disabled={payDisabled}
                    total={money(displayedTotal, order.currency)}
                    onIp={setIp}
                    onHolderNameChange={setCardHolderName}
                    onToken={(token) =>
                      token ? void sendPayment(token) : failedSdk()
                    }
                    onError={() => failedSdk()}
                    onStart={(holder_name) => {
                      if (pendingCard.current || inFlight.current) return false;
                      const submittedCardholder = normalizeName(holder_name);
                      if (
                        reuseRecipientDocument &&
                        submittedCardholder !== payerFullName &&
                        submittedCardholder !== cardholder
                      ) {
                        setCardHolderName(holder_name);
                        return false;
                      }
                      const buyer = readBuyerForm(buyerForm.current, ip);
                      if (!buyer || !holder_name) return false;
                      pendingCard.current = {
                        buyer: { ...buyer, holder_name },
                        installments,
                        reviewedTotal: displayedTotal,
                      };
                      setBusy(true);
                      tokenTimer.current = setTimeout(
                        () => failedSdk(true),
                        20000,
                      );
                      return true;
                    }}
                  />
                  {method === "pix" && (
                    <button
                      type="button"
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
                  className="checkout-muted mt-4 flex items-center gap-2 text-sm"
                >
                  <Loader2 size={16} className="animate-spin" />
                  {t("Processing your payment")}
                </p>
              )}
            </>
          )}
          {order.can_cancel && (
            <button
              className="checkout-muted mt-6 min-h-11 text-sm underline underline-offset-4 disabled:opacity-40"
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
      </div>
      <style jsx global>{`
        .checkout-payment-panel {
          border-color: #e6d9f4;
          background: #f7f1ff;
          color: #27143d;
          color-scheme: light;
          --checkout-muted: #4e3b63;
          --checkout-accent: #5823a3;
          --checkout-warning: #854d0e;
          --checkout-alert-bg: #fff2d9;
          --checkout-alert-text: #783a15;
          --checkout-method-border: #9382a3;
          --checkout-method-selected: #7441c5;
          --checkout-method-background: #e9dbfb;
          --checkout-hover: #f0e6fb;
          --checkout-focus: #6d28d9;
        }
        .checkout-muted {
          color: var(--checkout-muted, rgb(255 255 255/0.72));
        }
        .checkout-accent {
          color: var(--checkout-accent, #ddd6fe);
        }
        .checkout-warning {
          color: var(--checkout-warning, #fde68a);
        }
        .checkout-alert {
          background: var(--checkout-alert-bg, rgb(251 191 36/0.1));
          color: var(--checkout-alert-text, #fef3c7);
        }
        .checkout-method {
          border-color: var(--checkout-method-border, rgb(255 255 255/0.15));
          color: var(--checkout-muted, rgb(255 255 255/0.72));
        }
        .checkout-method:hover {
          background: var(--checkout-hover, rgb(255 255 255/0.05));
        }
        .checkout-method[aria-pressed="true"] {
          border-color: var(--checkout-method-selected, rgb(167 139 250/0.5));
          background: var(--checkout-method-background, rgb(139 92 246/0.15));
          color: var(--checkout-accent, #ddd6fe);
        }
        .checkout-method:focus-visible,
        .checkout-accent:focus-visible {
          outline: 2px solid var(--checkout-focus, #a78bfa);
          outline-offset: 2px;
        }
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
          border-color: var(--checkout-focus, #a78bfa);
          box-shadow: 0 0 0 2px rgb(167 139 250/0.15);
        }
        .checkout-payment-panel .checkout-input {
          border-color: #9989a8;
          background: #fffcff;
          color: #27143d;
        }
        .checkout-payment-panel .checkout-input:focus {
          border-color: var(--checkout-focus);
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
        .checkout-payment-panel .checkout-primary:hover {
          background: #6d28d9;
        }
        .checkout-primary:focus-visible {
          outline: 2px solid var(--checkout-focus, #c4b5fd);
          outline-offset: 2px;
        }
        .checkout-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
