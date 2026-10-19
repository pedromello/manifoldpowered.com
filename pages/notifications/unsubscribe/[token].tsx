import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useSyncExternalStore, type ReactElement } from "react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";
import { notificationRequest } from "lib/outlet-notification-client";

function subscribeFragmentChange(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

function fragmentToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token");
}

export default function UnsubscribePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"ready" | "busy" | "done" | "failed">(
    "ready",
  );
  const fragment = useSyncExternalStore(
    subscribeFragmentChange,
    fragmentToken,
    () => null,
  );
  const token =
    fragment ||
    (typeof router.query.token === "string" ? router.query.token : null);

  async function unsubscribe() {
    if (!token || state === "busy") return;
    setState("busy");
    try {
      await notificationRequest("/api/v1/notifications/unsubscribe", "POST", {
        token,
      });
      if (fragment)
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <Head>
        <title>{t("Unsubscribe | Manifold")}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <main className="min-h-[65vh] bg-[#0b0812] px-4 py-16 text-white">
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h1 className="text-2xl font-black">
            {state === "done"
              ? t("Email notifications disabled")
              : t("Disable emails from this Outlet?")}
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/60">
            {state === "done"
              ? t(
                  "You will no longer receive new selection emails from this Outlet. You are still following it.",
                )
              : t(
                  "This only disables new selection emails from this Outlet. Your other subscriptions are unchanged.",
                )}
          </p>
          {state !== "done" && (
            <button
              type="button"
              className="mt-6 min-h-11 rounded-lg bg-violet-600 px-5 font-bold disabled:opacity-60"
              disabled={!token || state === "busy"}
              onClick={unsubscribe}
            >
              {state === "busy"
                ? t("Saving...")
                : t("Disable email notifications")}
            </button>
          )}
          {state === "failed" && (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              {t(
                "Could not unsubscribe. Try again or manage your preferences.",
              )}
            </p>
          )}
          <Link
            href="/settings/notifications"
            className="mt-6 block text-sm text-violet-300 underline"
          >
            {t("Manage preferences")}
          </Link>
        </div>
      </main>
    </>
  );
}

UnsubscribePage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
