import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import useSWR from "swr";
import { ArrowRight, Loader2 } from "lucide-react";
import type { GiftCardProduct } from "infra/gift_card_provider";
import { useI18n } from "lib/i18n";
import { formatMoney } from "lib/price";
import { GiftCardArtwork, giftCardArtwork } from "./GiftCardArtwork";

type Catalog = { products: GiftCardProduct[]; checkout_available: boolean };

async function catalogFetcher(url: string): Promise<Catalog> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Catalog unavailable");
  return response.json();
}

export function GiftCardCatalog({ featured = false }: { featured?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const Title = featured ? "h2" : "h1";
  const { data, error, isLoading, mutate } = useSWR<Catalog>(
    "/api/v1/gift-cards",
    catalogFetcher,
    { shouldRetryOnError: false },
  );
  const { data: buyer } = useSWR<{ id: string }>(
    "/api/v1/user",
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Not logged in");
      return response.json();
    },
    { shouldRetryOnError: false },
  );

  function loginHref(product: GiftCardProduct) {
    const callback = `${locale === "pt-BR" ? "/pt-BR" : ""}/store/gift-cards?product=${encodeURIComponent(product.code)}`;
    return `/login?callbackUrl=${encodeURIComponent(callback)}`;
  }

  async function buy(product: GiftCardProduct) {
    if (busy) return;
    setBusy(product.code);
    setMessage("");
    try {
      // Revalidate identity before using a buyer-scoped purchase key.
      const userResponse = await fetch("/api/v1/user", { cache: "no-store" });
      if (!userResponse.ok) {
        await router.push(loginHref(product));
        return;
      }
      const user = await userResponse.json();
      if (!data?.checkout_available) {
        setMessage(
          t(
            "New purchases are temporarily unavailable. Please try again later.",
          ),
        );
        await mutate();
        return;
      }
      const storageKey = `gift-card-request:${user.id}:${product.code}`;
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: "GIFT_CARD",
          item_id: product.code,
          idempotency_key: key,
        }),
      });
      if (!response.ok) throw new Error("Purchase unavailable");
      const order: { id: string } = await response.json();
      sessionStorage.removeItem(storageKey);
      await router.push(`/checkout/${order.id}`);
    } catch {
      setMessage(t("We could not start your purchase. Try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      id="gift-cards"
      aria-labelledby="gift-card-catalog-title"
      className="scroll-mt-20"
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Title
            id="gift-card-catalog-title"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {t("Gift cards")}
          </Title>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
            {t("Choose your gift card.")}
          </p>
        </div>
        {featured ? (
          <Link
            href="/store/gift-cards"
            className="inline-flex items-center gap-2 text-sm font-bold text-violet-200 hover:text-white"
          >
            {t("Explore gift cards")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href="/library/gift-cards"
            className="text-sm font-semibold text-violet-200 hover:text-white"
          >
            {t("My gift cards")}
          </Link>
        )}
      </div>
      {isLoading ? (
        <p
          role="status"
          className="flex items-center gap-2 py-8 text-sm text-white/60"
        >
          <Loader2 className="animate-spin" size={18} />
          {t("Loading gift cards")}
        </p>
      ) : error ? (
        <div className="mt-6">
          <p role="alert">
            {t("We could not load the gift cards. Try again.")}
          </p>
          <button
            type="button"
            onClick={() => mutate()}
            className="mt-3 text-sm font-bold text-violet-200"
          >
            {t("Try again")}
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data?.products.map((product) => {
            const artwork = giftCardArtwork[product.code];
            return (
              <article
                key={product.code}
                className={`group min-w-0 overflow-hidden rounded-xl border bg-[#16131d] transition-colors hover:border-white/25 ${router.query.product === product.code ? "border-violet-300" : "border-white/10"}`}
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b border-white/10 bg-[#1b2838]">
                  <GiftCardArtwork
                    productCode={product.code}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">
                    {artwork?.platform ?? t("Gift cards")}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight">
                    {product.name}
                  </h3>
                  <div className="mt-4 flex items-baseline justify-between gap-2">
                    <p className="text-2xl font-bold tracking-tight">
                      {formatMoney(
                        (product.amount_minor / 100).toFixed(2),
                        product.currency,
                      )}
                    </p>
                  </div>
                  {!data.checkout_available ? (
                    <button
                      type="button"
                      disabled
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-white/5 px-4 text-sm font-semibold text-white/40 disabled:cursor-not-allowed"
                    >
                      {t("Purchases unavailable")}
                    </button>
                  ) : buyer ? (
                    <button
                      type="button"
                      disabled={Boolean(busy) || !data.checkout_available}
                      aria-busy={busy === product.code}
                      onClick={() => buy(product)}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold transition-colors hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/40"
                    >
                      {busy === product.code ? (
                        <Loader2
                          size={16}
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowRight size={16} aria-hidden="true" />
                      )}
                      {t(
                        busy === product.code ? "Opening your purchase" : "Buy",
                      )}
                    </button>
                  ) : (
                    <Link
                      href={loginHref(product)}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold transition-colors hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
                    >
                      {t("Log in to buy")}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  )}
                  <p className="mt-3 text-center text-[11px] text-white/40">
                    {t(
                      "Receive your gift card by email after payment confirmation.",
                    )}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {data && !data.checkout_available && (
        <p className="mt-4 text-xs text-white/50">
          {t(
            "New purchases are temporarily unavailable. Please try again later.",
          )}
        </p>
      )}
      {data?.products.length === 0 && (
        <p className="mt-4 text-sm text-white/60">
          {t("No gift cards are available right now.")}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-4 text-sm text-amber-200">
          {message}
        </p>
      )}
    </section>
  );
}
