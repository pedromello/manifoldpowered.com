import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, type ReactElement } from "react";
import useSWR from "swr";
import { Bell, Loader2 } from "lucide-react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { OutletNotificationButton } from "components/store/OutletNotificationButton";
import type {
  NotificationPreferences,
  NotificationSubscriptions,
} from "contracts/outlet-notifications";
import { fetchJson, isAuthenticationError } from "lib/api-client";
import { useI18n } from "lib/i18n";
import { notificationRequest } from "lib/outlet-notification-client";

const preferencesUrl = "/api/v1/user/notification-preferences";

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [language, setLanguage] = useState<"en" | "pt-BR" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);
  const {
    data: user,
    error: userError,
    mutate: retryUser,
  } = useSWR<{ id: string }>("/api/v1/user", fetchJson, {
    shouldRetryOnError: false,
  });
  const {
    data: preferences,
    error: preferencesError,
    mutate,
  } = useSWR<NotificationPreferences>(user ? preferencesUrl : null, fetchJson, {
    shouldRetryOnError: false,
  });
  const {
    data,
    error: subscriptionsError,
    mutate: retrySubscriptions,
  } = useSWR<NotificationSubscriptions>(
    user ? "/api/v1/outlet-notifications" : null,
    fetchJson,
    { shouldRetryOnError: false },
  );
  const signedOut = [userError, preferencesError, subscriptionsError].some(
    isAuthenticationError,
  );
  const failed = userError || preferencesError || subscriptionsError;

  async function save() {
    if (!preferences || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await notificationRequest<NotificationPreferences>(
        preferencesUrl,
        "PATCH",
        { email_locale: language ?? preferences.email_locale },
      );
      await mutate(saved, { revalidate: false });
      setLanguage(null);
      setMessage("saved");
    } catch (error) {
      if (isAuthenticationError(error))
        void router.push(
          `/login?callbackUrl=${encodeURIComponent(router.asPath)}`,
        );
      else setMessage("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Notification preferences | Manifold")}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="min-h-[70vh] bg-[#0b0812] px-4 py-10 text-white sm:px-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <header>
            <Bell className="mb-3 text-violet-300" aria-hidden="true" />
            <h1 className="text-3xl font-black">
              {t("Notification preferences")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/60">
              {t(
                "Receive emails only when an Outlet publishes a new selection. Edits never send another email.",
              )}
            </p>
          </header>
          {signedOut ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-5 font-bold"
              href={`/login?callbackUrl=${encodeURIComponent(router.asPath)}`}
            >
              {t("Log in")}
            </Link>
          ) : failed ? (
            <div role="alert">
              <p>{t("Could not load notifications. Retry")}</p>
              <button
                type="button"
                className="mt-3 min-h-11 rounded-lg border border-white/20 px-4"
                onClick={() => {
                  void retryUser();
                  void mutate();
                  void retrySubscriptions();
                }}
              >
                {t("Retry")}
              </button>
            </div>
          ) : !preferences || !data ? (
            <Loader2
              className="animate-spin"
              aria-label={t("Loading notifications")}
            />
          ) : (
            <>
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <label htmlFor="email-language" className="block font-bold">
                  {t("Email language")}
                </label>
                <p
                  id="email-language-description"
                  className="mt-2 text-sm leading-6 text-white/60"
                >
                  {t(
                    "This language applies to notification emails from every Outlet. Changing the site language does not change it.",
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <select
                    id="email-language"
                    aria-describedby="email-language-description"
                    className="min-h-11 rounded-lg border border-white/20 bg-[#14101c] px-3"
                    value={language ?? preferences.email_locale}
                    disabled={busy}
                    onChange={(event) => {
                      setLanguage(event.target.value as "en" | "pt-BR");
                      setMessage(null);
                    }}
                  >
                    <option value="en">English</option>
                    <option value="pt-BR">Português (Brasil)</option>
                  </select>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-violet-600 px-5 font-bold disabled:opacity-60"
                    disabled={busy}
                    onClick={save}
                  >
                    {busy ? t("Saving...") : t("Save preferences")}
                  </button>
                </div>
                {message && (
                  <p
                    className="mt-3 text-sm"
                    role={message === "failed" ? "alert" : "status"}
                  >
                    {message === "saved"
                      ? t("Preferences saved")
                      : t("Could not update notifications. Try again.")}
                  </p>
                )}
              </section>
              <section>
                <h2 className="text-xl font-bold">{t("Your Outlets")}</h2>
                <p className="mt-2 text-sm text-white/60">
                  {t("Turning off emails keeps you following the Outlet.")}
                </p>
                <ul className="mt-4 divide-y divide-white/10">
                  {data.subscriptions.map((subscription) => (
                    <li
                      key={subscription.store_slug}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <Link
                        className="min-w-0 break-words font-bold hover:text-violet-300"
                        href={`/store/${encodeURIComponent(subscription.store_slug)}`}
                      >
                        {subscription.store_name}
                      </Link>
                      <OutletNotificationButton
                        storeSlug={subscription.store_slug}
                        variant="platform"
                        initialStatus={subscription}
                      />
                    </li>
                  ))}
                </ul>
                {data.subscriptions.length === 0 && (
                  <p className="mt-4 text-sm text-white/60">
                    {t(
                      "No Outlet email notifications yet. Enable the bell on an Outlet to get started.",
                    )}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

NotificationSettingsPage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
