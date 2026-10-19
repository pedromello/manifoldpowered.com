import { Bell, BellRing, Check, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/router";
import { useId, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { NotificationStatus } from "contracts/outlet-notifications";
import { fetchJson, isAuthenticationError } from "lib/api-client";
import { useI18n } from "lib/i18n";
import {
  needsEmailLogin,
  notificationStatusUrl,
  updateOutletNotifications,
} from "lib/outlet-notification-client";

export function OutletNotificationButton({
  storeSlug,
  variant = "theme",
  initialStatus,
}: {
  storeSlug: string;
  variant?: "platform" | "theme";
  initialStatus?: NotificationStatus;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const tooltipId = useId();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const {
    data: user,
    error: userError,
    isLoading: loadingUser,
    mutate: retryUser,
  } = useSWR<{
    id: string;
  }>("/api/v1/user", fetchJson, { shouldRetryOnError: false });
  const { data, error, isLoading, mutate } = useSWR<NotificationStatus>(
    user ? notificationStatusUrl(storeSlug) : null,
    fetchJson,
    {
      shouldRetryOnError: false,
      fallbackData: initialStatus,
      revalidateOnMount: initialStatus ? false : undefined,
    },
  );
  const signedOut = isAuthenticationError(userError);
  const loading = busy || loadingUser || (!!user && isLoading);
  const loadError = !signedOut && (userError || error);
  const title = data?.enabled
    ? t("Email notifications enabled")
    : t("Receive new selections by email");
  const login = (verifyEmail = false) =>
    router.push(
      `/login?${verifyEmail ? "verifyEmail=1&" : ""}callbackUrl=${encodeURIComponent(router.asPath)}`,
    );

  async function toggle() {
    if (loading) return;
    if (signedOut) return void login();
    if (loadError) return void (userError ? retryUser() : mutate());
    if (!data) return;
    if (!data.enabled && data.requires_email_login) return void login(true);
    setBusy(true);
    setFailed(false);
    try {
      const confirmed = await updateOutletNotifications(
        storeSlug,
        !data.enabled,
        locale,
      );
      await mutate(confirmed, { revalidate: false });
      await Promise.allSettled([
        mutateGlobal(
          `/api/v1/store-follows/status?store_slug=${encodeURIComponent(storeSlug)}`,
          { is_followed: confirmed.is_followed },
          { revalidate: false },
        ),
        mutateGlobal("/api/v1/store-follows"),
        mutateGlobal("/api/v1/outlet-notifications"),
        mutateGlobal("/api/v1/user/notification-preferences"),
      ]);
    } catch (cause) {
      if (isAuthenticationError(cause) || needsEmailLogin(cause))
        void login(needsEmailLogin(cause));
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (data?.available === false) return null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="group relative">
        <button
          type="button"
          data-storefront="outlet-notifications"
          aria-label={
            loadError ? t("Could not load notifications. Retry") : title
          }
          aria-describedby={tooltipId}
          aria-pressed={!!data?.enabled}
          disabled={loading || (!signedOut && !loadError && !data)}
          onClick={toggle}
          className={`relative inline-flex min-h-11 min-w-11 items-center justify-center border transition-colors hover:border-sf-accent hover:text-sf-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent disabled:cursor-wait disabled:opacity-60 ${variant === "platform" ? "rounded-lg" : ""} ${data?.enabled ? "border-sf-accent bg-sf-accent/10 text-sf-accent" : "border-sf-border bg-sf-surface text-sf-muted"}`}
        >
          {loading ? (
            <Loader2 size={19} className="animate-spin" aria-hidden="true" />
          ) : loadError ? (
            <RotateCcw size={19} aria-hidden="true" />
          ) : data?.enabled ? (
            <>
              <BellRing size={19} fill="currentColor" aria-hidden="true" />
              <Check
                size={10}
                strokeWidth={3}
                className="absolute bottom-1 right-1"
                aria-hidden="true"
              />
            </>
          ) : (
            <Bell size={19} aria-hidden="true" />
          )}
        </button>
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-40 max-w-[calc(100vw-2rem)] rounded-lg border border-sf-border bg-sf-surface p-2 text-xs text-sf-fg opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {title}
        </span>
      </div>
      {failed && (
        <span role="alert" className="max-w-52 text-xs text-rose-300">
          {t("Could not update notifications. Try again.")}
        </span>
      )}
    </div>
  );
}
