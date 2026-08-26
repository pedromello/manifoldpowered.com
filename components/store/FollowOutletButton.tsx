import { Check, Loader2, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { fetchJson, isAuthenticationError } from "lib/api-client";
import {
  type StoreFollowStatus,
  updateOutletFollow,
} from "lib/store-follow-client";
import { useI18n } from "lib/i18n";

type CurrentUser = { id: string };

export function FollowOutletButton({
  storeSlug,
  storeName,
  variant = "theme",
}: {
  storeSlug: string;
  storeName: string;
  variant?: "platform" | "theme";
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [isMutating, setIsMutating] = useState(false);
  const [mutationFailed, setMutationFailed] = useState(false);
  const shapeClass = variant === "platform" ? "rounded-lg" : "";

  const {
    data: currentUser,
    error: userError,
    isLoading: isUserLoading,
    mutate: retryUser,
  } = useSWR<CurrentUser>("/api/v1/user", fetchJson, {
    shouldRetryOnError: false,
  });

  const statusUrl = currentUser
    ? `/api/v1/store-follows/status?store_slug=${encodeURIComponent(storeSlug)}`
    : null;
  const {
    data: followStatus,
    error: statusError,
    isLoading: isStatusLoading,
    mutate: mutateStatus,
  } = useSWR<StoreFollowStatus>(statusUrl, fetchJson, {
    shouldRetryOnError: false,
  });

  const signedOut = isAuthenticationError(userError);
  const isLoading =
    isUserLoading || (currentUser !== undefined && isStatusLoading);

  async function toggleFollow() {
    if (!currentUser || !followStatus || isMutating) return;

    setMutationFailed(false);
    setIsMutating(true);
    try {
      await updateOutletFollow({
        storeSlug,
        isFollowed: followStatus.is_followed,
        applyStatus: mutateStatus,
      });
      await Promise.all([
        mutateStatus(),
        mutateGlobal("/api/v1/store-follows"),
      ]);
    } catch {
      setMutationFailed(true);
    } finally {
      setIsMutating(false);
    }
  }

  if (isLoading) {
    return (
      <button
        type="button"
        data-storefront="follow-outlet"
        disabled
        aria-label={t("Loading follow status")}
        className={`inline-flex min-h-10 items-center gap-2 border border-sf-border bg-sf-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-sf-muted opacity-80 ${shapeClass}`}
      >
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        {t("Follow")}
      </button>
    );
  }

  if (signedOut) {
    return (
      <button
        type="button"
        data-storefront="follow-outlet"
        onClick={() =>
          router.push(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`)
        }
        aria-label={t("Follow {name}", { name: storeName })}
        className={`inline-flex min-h-10 items-center gap-2 bg-sf-accent px-4 py-2 text-xs font-black uppercase tracking-wider text-sf-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent ${shapeClass}`}
      >
        <Plus size={15} aria-hidden="true" />
        {t("Follow")}
      </button>
    );
  }

  if (userError || statusError || !followStatus) {
    return (
      <button
        type="button"
        data-storefront="follow-outlet"
        onClick={() => (userError ? retryUser() : mutateStatus())}
        aria-label={t("Could not load follow status. Retry")}
        className={`inline-flex min-h-10 items-center gap-2 border border-rose-400/50 bg-rose-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-200 transition-colors hover:bg-rose-500/20 ${shapeClass}`}
      >
        <RotateCcw size={15} aria-hidden="true" />
        {t("Retry")}
      </button>
    );
  }

  const isFollowed = followStatus.is_followed;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        data-storefront="follow-outlet"
        onClick={toggleFollow}
        disabled={isMutating}
        aria-pressed={isFollowed}
        aria-label={
          isFollowed
            ? t("Unfollow {name}", { name: storeName })
            : t("Follow {name}", { name: storeName })
        }
        className={`inline-flex min-h-10 items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent disabled:cursor-wait disabled:opacity-70 ${shapeClass} ${
          isFollowed
            ? "border-sf-border bg-sf-surface text-sf-fg hover:border-sf-accent"
            : "border-transparent bg-sf-accent text-sf-accent-fg hover:opacity-90"
        }`}
      >
        {isMutating ? (
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        ) : isFollowed ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Plus size={15} aria-hidden="true" />
        )}
        {t(isFollowed ? "Following" : "Follow")}
      </button>
      {mutationFailed && (
        <span
          role="status"
          className="max-w-52 text-xs font-semibold text-rose-300"
        >
          {t("Could not update this Outlet. Try again.")}
        </span>
      )}
    </div>
  );
}
