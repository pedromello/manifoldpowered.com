import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useI18n } from "lib/i18n";
import {
  externalImportStatusUrl,
  getExternalStore,
  type ExternalStoreProvider,
} from "lib/external_stores";
import {
  requestExternalImport,
  externalImportErrorMessage,
  type ExternalImportResponse,
} from "lib/external_import_client";

const userFetcher = async (url: string): Promise<{ features?: string[] }> => {
  const response = await fetch(url);
  return response.ok ? response.json() : {};
};

export function ExternalGameRefreshButton({
  provider,
  value,
}: {
  provider: ExternalStoreProvider;
  value: string;
}) {
  const store = getExternalStore(provider);
  const { permission } = store;
  const failureMessage = store.messages.failure;
  const { data } = useSWR("/api/v1/user", userFetcher);
  const { t, translateError, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [now, setNow] = useState(Date.now());
  const statusKey = data?.features?.includes(permission)
    ? externalImportStatusUrl(provider, value, { locale })
    : null;
  const { data: status, mutate } = useSWR<ExternalImportResponse>(
    statusKey,
    async (key: string) => {
      const response = await fetch(key);
      if (!response.ok) return {};
      return response.json();
    },
  );
  useEffect(() => () => controller.current?.abort(), []);
  const next = status?.refresh?.next_allowed_at;
  useEffect(() => {
    if (!next) return;
    const delay = new Date(next).getTime() - Date.now();
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(delay + 50, 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [next]);
  const cooling =
    status?.refresh?.state !== "in_progress" &&
    next &&
    new Date(next).getTime() > now;
  if (!data?.features?.includes(permission)) return null;
  async function refresh() {
    setBusy(true);
    setError(null);
    controller.current = new AbortController();
    try {
      const body = await requestExternalImport(
        provider,
        value,
        locale,
        (refresh) => {
          void mutate({ refresh }, false);
        },
        controller.current.signal,
      );
      if (body.refresh?.state === "cached") {
        await mutate(body, false);
        setNow(Date.now());
      } else router.reload();
    } catch (error) {
      void mutate();
      setError(
        translateError(
          externalImportErrorMessage(error, provider),
          failureMessage,
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy || Boolean(cooling)}
        onClick={refresh}
        className="font-bold text-violet-200 disabled:opacity-50"
      >
        {t(
          busy
            ? "Update in progress"
            : cooling && status?.refresh?.state !== "failed"
              ? "Data updated recently"
              : store.messages.refresh,
        )}
      </button>
      {!error &&
        status?.refresh?.state === "failed" &&
        status.refresh.message && (
          <p role="alert" className="mt-2 text-rose-300">
            {translateError(status.refresh.message, failureMessage)}
          </p>
        )}
      {!busy && status?.refresh?.state === "in_progress" && (
        <p>{t("Update in progress")}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
