import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type { GetServerSideProps } from "next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSWRConfig } from "swr";
import { GiftCardArtwork } from "components/store/GiftCardArtwork";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import type { GiftCardProduct } from "infra/gift_card_provider";
import { giftCardsEnabled } from "infra/runtime";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";
import { acceptProductEventContext } from "lib/product-events-client";
import {
  giftCardCheckoutAvailable,
  giftCardProducts,
} from "models/gift_card_catalog";

type Props = { product: GiftCardProduct | null; checkoutAvailable: boolean };
type Challenge = { id: string; maskedEmail?: string };
type SavedChallenge = Challenge & { product: string; resendAt: number };
type CodeRequest = { address: string } | { challengeId: string };
type CheckoutResponse = {
  challenge_id?: string;
  retry_after?: number;
  masked_email?: string;
  checkout_url?: string;
  message?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fieldClass =
  "h-12 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3.5 text-base text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60";

function pendingCheckoutKey(intentId: string) {
  return `gift-card-checkout:${intentId}`;
}

async function checkoutRequest(
  path: "email" | "resend" | "verify",
  body: object,
) {
  const response = await fetch(`/api/v1/checkout/gift-card/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: CheckoutResponse =
    (await response.json().catch(() => null)) ?? {};
  return { response, data };
}

export default function GiftCardEmailCheckout({
  product,
  checkoutAvailable,
}: Props) {
  const { t, translateError, locale } = useI18n();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState<"email" | "resend" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [productUnavailable, setProductUnavailable] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [retryEmail, setRetryEmail] = useState<string | null>(null);
  const intent = useRef<string>(null);
  const inFlight = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const editingEmail = useRef(false);
  const activeChallenge = challenge?.id;
  const productCode = product?.code;
  const urlIntent = router.query.intent;
  const waitForEmailRetry =
    !challenge && seconds > 0 && email.trim() === retryEmail;

  useEffect(() => {
    if (
      !router.isReady ||
      !productCode ||
      typeof urlIntent !== "string" ||
      !uuid.test(urlIntent)
    )
      return;
    intent.current = urlIntent;
    try {
      const saved: SavedChallenge | null = JSON.parse(
        sessionStorage.getItem(pendingCheckoutKey(urlIntent)) ?? "null",
      );
      if (
        saved?.product !== productCode ||
        !uuid.test(saved.id) ||
        !Number.isFinite(saved.resendAt)
      )
        return;
      setChallenge({
        id: saved.id,
        maskedEmail:
          typeof saved.maskedEmail === "string" ? saved.maskedEmail : undefined,
      });
      setSeconds(Math.max(0, Math.ceil((saved.resendAt - Date.now()) / 1000)));
      setResendAt(saved.resendAt);
    } catch {
      // Checkout is still available when tab storage is disabled.
    }
  }, [productCode, router.isReady, urlIntent]);

  useEffect(() => {
    if (activeChallenge) codeInput.current?.focus();
    else if (editingEmail.current) {
      emailInput.current?.focus();
      emailInput.current?.select();
      editingEmail.current = false;
    }
  }, [activeChallenge]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  function waitBeforeResend(delay: number) {
    const wait = Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : 45;
    const deadline = Date.now() + wait * 1000;
    setSeconds(wait);
    setResendAt(deadline);
    return deadline;
  }

  function clearSavedChallenge() {
    if (!intent.current) return;
    try {
      sessionStorage.removeItem(pendingCheckoutKey(intent.current));
    } catch {
      // Storage is optional; the server validates the code and browser session.
    }
  }

  function saveChallenge(pending: Challenge, deadline: number) {
    if (!intent.current || !product) return;
    try {
      const saved: SavedChallenge = {
        ...pending,
        product: product.code,
        resendAt: deadline,
      };
      sessionStorage.setItem(
        pendingCheckoutKey(intent.current),
        JSON.stringify(saved),
      );
    } catch {
      // The challenge works in the open tab even without tab storage.
    }
  }

  async function requestCode(request: CodeRequest) {
    if (!product || inFlight.current) return;
    const resending = "challengeId" in request;
    inFlight.current = true;
    setBusy(resending ? "resend" : "email");
    setError("");
    setStatus("");
    try {
      const previous = urlIntent;
      let intentId = intent.current;
      if (!intentId && typeof previous === "string" && uuid.test(previous)) {
        intentId = previous;
      }
      if (!intentId) {
        intentId = crypto.randomUUID();
        const updated = await router.replace(
          {
            pathname: router.pathname,
            query: { product: product.code, intent: intentId },
          },
          undefined,
          { shallow: true },
        );
        if (!updated) {
          setError(t("We could not send the confirmation code. Try again."));
          return;
        }
      }
      intent.current = intentId;

      const { response, data } = resending
        ? await checkoutRequest("resend", {
            challenge_id: request.challengeId,
            locale,
          })
        : await checkoutRequest("email", {
            email: request.address,
            product_code: product.code,
            intent_id: intentId,
            locale,
          });
      if (!response.ok || typeof data.challenge_id !== "string") {
        if (
          response.status === 409 &&
          data.message === "This gift card is no longer available."
        ) {
          setProductUnavailable(true);
          clearSavedChallenge();
          return;
        }
        if (response.status === 429) {
          const deadline = waitBeforeResend(
            Number(response.headers.get("Retry-After")),
          );
          if (resending && challenge) saveChallenge(challenge, deadline);
          if (!resending) setRetryEmail(request.address);
        }
        if (
          resending &&
          (response.status === 401 ||
            (response.status === 409 &&
              data.message === "Invalid or expired checkout code."))
        ) {
          editEmail();
          setSeconds(0);
          setResendAt(0);
          setRetryEmail(null);
          setError(t("Your checkout session expired. Enter your email again."));
          return;
        }
        setError(
          translateError(
            data.message,
            "We could not send the confirmation code. Try again.",
          ),
        );
        return;
      }
      if (resending) setStatus(t("New code sent."));
      const deadline = waitBeforeResend(data.retry_after ?? 45);
      setCode("");
      setRetryEmail(null);
      const pending = {
        id: data.challenge_id,
        maskedEmail:
          typeof data.masked_email === "string"
            ? data.masked_email
            : challenge?.maskedEmail,
      };
      setChallenge(pending);
      saveChallenge(pending, deadline);
    } catch {
      setError(t("We could not send the confirmation code. Try again."));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || inFlight.current) return;
    inFlight.current = true;
    setBusy("verify");
    setError("");
    setStatus("");
    try {
      const { response, data } = await checkoutRequest("verify", {
        challenge_id: challenge.id,
        code,
      });
      if (!response.ok) {
        if (
          response.status === 409 &&
          data.message === "This gift card is no longer available."
        ) {
          setProductUnavailable(true);
          clearSavedChallenge();
          return;
        }
        if (response.status === 429) {
          waitBeforeResend(Number(response.headers.get("Retry-After")));
        }
        setError(
          translateError(
            data.message,
            "We could not confirm your code. Try again.",
          ),
        );
        return;
      }
      const id = data.checkout_url?.split("/")[2];
      if (!id || !uuid.test(id) || data.checkout_url !== `/checkout/${id}`) {
        setError(t("We could not open your order. Try again."));
        return;
      }
      acceptProductEventContext(response);
      void mutate("/api/v1/user").catch(() => {});
      const opened = await router.replace(data.checkout_url);
      if (opened) clearSavedChallenge();
      else setError(t("We could not open your order. Try again."));
    } catch {
      setError(t("We could not open your order. Try again."));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function editEmail() {
    editingEmail.current = true;
    clearSavedChallenge();
    setChallenge(null);
    setCode("");
    setError("");
    setStatus("");
  }

  return (
    <>
      <Head>
        <title>{`${t("Complete your purchase")} | Manifold`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="mx-auto min-h-[70vh] w-full max-w-xl px-4 pb-24 pt-7 text-white sm:px-6 sm:pt-12">
        <Link
          href="/store/gift-cards"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-violet-200 hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t("Gift cards")}
        </Link>
        <h1 className="mb-5 mt-3 text-2xl font-bold sm:text-3xl">
          {t("Complete your purchase")}
        </h1>
        {product && (
          <div className="mb-5 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div
              aria-hidden="true"
              className="relative aspect-square w-14 shrink-0 overflow-hidden rounded-lg bg-[#1b2838]"
            >
              <GiftCardArtwork productCode={product.code} sizes="56px" />
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-white/80">
                {product.name}
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {formatMoney(
                  (product.amount_minor / 100).toFixed(2),
                  product.currency,
                )}
              </p>
            </div>
          </div>
        )}
        {product && checkoutAvailable && !productUnavailable ? (
          <form
            method="post"
            aria-busy={Boolean(busy)}
            className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#14101c] p-4 sm:p-6"
            onSubmit={
              challenge
                ? verifyCode
                : (event) => {
                    event.preventDefault();
                    void requestCode({ address: email.trim() });
                  }
            }
          >
            {challenge ? (
              <>
                <h2 className="text-lg font-bold">{t("Confirm your email")}</h2>
                <p
                  id="email-code-help"
                  className="-mt-2 break-words text-sm text-white/70"
                >
                  {challenge.maskedEmail
                    ? t("We sent a six-digit code to {email}.", {
                        email: challenge.maskedEmail,
                      })
                    : t("Enter the six-digit code we sent to your email.")}
                </p>
                <label
                  className="flex flex-col gap-2 text-sm font-semibold"
                  htmlFor="gift-card-email-code"
                >
                  {t("Six-digit code")}
                  <input
                    ref={codeInput}
                    id="gift-card-email-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    aria-describedby="email-code-help"
                    className={`${fieldClass} tabular-nums tracking-[0.3em]`}
                    required
                    disabled={Boolean(busy)}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label
                  className="flex flex-col gap-2 text-sm font-semibold"
                  htmlFor="gift-card-checkout-email"
                >
                  {t("Email")}
                  <input
                    ref={emailInput}
                    id="gift-card-checkout-email"
                    type="email"
                    autoComplete="email"
                    aria-describedby="checkout-email-help"
                    maxLength={234}
                    className={fieldClass}
                    required
                    disabled={Boolean(busy)}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <p
                  id="checkout-email-help"
                  className="text-sm leading-6 text-white/70"
                >
                  {t(
                    "Your gift card will be sent to this email. If you don't have an account, we'll create one so you can track your order.",
                  )}
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm leading-6 text-rose-300">
                {error}
              </p>
            )}
            {status && (
              <p role="status" className="text-sm text-violet-200">
                {status}
              </p>
            )}
            <button
              type="submit"
              disabled={Boolean(busy) || waitForEmailRetry}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-bold hover:bg-violet-500 disabled:opacity-60"
            >
              {busy && busy !== "resend" && (
                <Loader2
                  size={16}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {waitForEmailRetry
                ? t("Try again in {seconds}s", { seconds })
                : t(
                    busy === "email"
                      ? "Sending code..."
                      : busy === "verify"
                        ? "Verifying..."
                        : challenge
                          ? "Confirm and continue"
                          : "Continue with email",
                  )}
            </button>
            {challenge && (
              <div className="flex flex-wrap items-center justify-between gap-x-4">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={editEmail}
                  className="min-h-11 text-left text-sm font-semibold text-violet-200 hover:text-white disabled:opacity-60"
                >
                  {t("Change email")}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || seconds > 0}
                  onClick={() =>
                    void requestCode({ challengeId: challenge.id })
                  }
                  className="min-h-11 text-left text-sm font-semibold text-violet-200 hover:text-white disabled:text-white/50"
                >
                  {busy === "resend"
                    ? t("Sending code...")
                    : seconds > 0
                      ? t("Resend code in {seconds}s", { seconds })
                      : t("Resend code")}
                </button>
              </div>
            )}
          </form>
        ) : (
          <p
            role={productUnavailable ? "alert" : "status"}
            className="text-sm leading-6 text-white/70"
          >
            {t(
              product && !productUnavailable
                ? "New purchases are temporarily unavailable. Please try again later."
                : "This gift card is unavailable. Choose another gift card.",
            )}
          </p>
        )}
      </main>
    </>
  );
}

GiftCardEmailCheckout.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);

export const getServerSideProps: GetServerSideProps<Props> = async ({
  query,
  res,
}) => {
  if (!giftCardsEnabled()) return { notFound: true };
  res.setHeader("Cache-Control", "no-store");
  const selected =
    typeof query.product === "string" && query.product.length <= 255
      ? (await giftCardProducts()).find((item) => item.code === query.product)
      : null;
  const product = selected
    ? {
        code: selected.code,
        name: selected.name,
        amount_minor: selected.amount_minor,
        currency: selected.currency,
      }
    : null;
  return {
    props: {
      product,
      checkoutAvailable: giftCardCheckoutAvailable(),
    },
  };
};
