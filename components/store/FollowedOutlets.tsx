import Link from "next/link";
import { Loader2, RotateCcw, Store } from "lucide-react";
import useSWR from "swr";

import type { StoreApi } from "components/store/types";
import { fetchJson, isAuthenticationError } from "lib/api-client";
import { useI18n } from "lib/i18n";

type CurrentUser = { id: string };
type FollowedStoresResponse = { stores: StoreApi[] };

const MAX_VISIBLE_OUTLETS = 4;

export function FollowedOutlets() {
  const { t } = useI18n();
  const {
    data: currentUser,
    error: userError,
    isLoading: isUserLoading,
    mutate: retryUser,
  } = useSWR<CurrentUser>("/api/v1/user", fetchJson, {
    shouldRetryOnError: false,
  });
  const {
    data,
    error: storesError,
    isLoading: areStoresLoading,
    mutate: retryStores,
  } = useSWR<FollowedStoresResponse>(
    currentUser ? "/api/v1/store-follows" : null,
    fetchJson,
    { shouldRetryOnError: false },
  );

  const stores = data?.stores || [];
  const hiddenCount = Math.max(0, stores.length - MAX_VISIBLE_OUTLETS);

  return (
    <section
      className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3"
      aria-labelledby="followed-outlets-heading"
    >
      <p
        id="followed-outlets-heading"
        className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35"
      >
        {t("Followed Outlets")}
      </p>

      {isUserLoading || (currentUser && areStoresLoading) ? (
        <div className="flex h-14 items-center justify-center text-white/35">
          <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          <span className="sr-only">{t("Loading followed Outlets")}</span>
        </div>
      ) : isAuthenticationError(userError) ? (
        <div className="px-1 pb-1">
          <p className="text-xs leading-5 text-white/40">
            {t("Log in to see the Outlets you follow.")}
          </p>
          <Link
            href="/login?callbackUrl=%2Fstore"
            className="mt-2 inline-flex text-xs font-bold text-violet-300 hover:text-violet-200"
          >
            {t("Log in")}
          </Link>
        </div>
      ) : userError || storesError ? (
        <button
          type="button"
          onClick={() => (userError ? retryUser() : retryStores())}
          className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-xs font-semibold text-rose-300 hover:text-rose-200"
        >
          <RotateCcw size={14} aria-hidden="true" />
          {t("Could not load followed Outlets. Retry")}
        </button>
      ) : stores.length === 0 ? (
        <p className="px-1 pb-1 text-xs leading-5 text-white/40">
          {t("Outlets you follow will appear here.")}
        </p>
      ) : (
        <div className="space-y-0.5">
          {stores.slice(0, MAX_VISIBLE_OUTLETS).map((store) => (
            <Link
              key={store.id}
              href={`/store/${store.slug}`}
              className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1.5 text-xs font-semibold text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              {store.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logo_url}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-md border border-white/10 object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/40">
                  <Store size={13} aria-hidden="true" />
                </span>
              )}
              <span className="truncate">{store.name}</span>
            </Link>
          ))}
          {hiddenCount > 0 && (
            <p className="px-1 pt-1 text-[11px] font-semibold text-white/30">
              {t("{count} more", { count: hiddenCount })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
