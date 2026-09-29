import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { useI18n } from "lib/i18n";
import {
  requestExternalImport,
  externalImportErrorMessage,
} from "lib/external_import_client";
import {
  getExternalStore,
  type ExternalStoreProvider,
} from "lib/external_stores";

const userFetcher = async (
  url: string,
): Promise<{ features?: string[] } | null> => {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
};

export function ExternalGameImportPage({
  provider,
}: {
  provider: ExternalStoreProvider;
}) {
  const store = getExternalStore(provider);
  const router = useRouter();
  const { t, translateError, locale } = useI18n();
  const { data: user, isLoading } = useSWR("/api/v1/user", userFetcher);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!isLoading && user === null)
      void router.replace(
        `/login?callbackUrl=${encodeURIComponent(router.asPath)}`,
      );
  }, [isLoading, user, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !user?.features?.includes(store.permission)) return;
    setError(null);
    const value = store.normalizeReference(input);
    if (!value) {
      setError(t(store.messages.invalidReference));
      return;
    }
    setBusy(true);
    controller.current = new AbortController();
    try {
      const body = await requestExternalImport(
        provider,
        value,
        locale,
        () => {},
        controller.current.signal,
      );
      await router.push(`/item/${body.slug}`);
    } catch (error) {
      setError(
        translateError(
          externalImportErrorMessage(error, provider),
          store.messages.failure,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>{`${t(store.messages.title)} | Manifold`}</title>
      </Head>
      <main className="min-h-screen bg-[#1D0F3B] px-4 py-24 text-white">
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-black">{t(store.messages.heading)}</h1>
          <p className="my-5 text-white/65">{t(store.messages.description)}</p>
          {isLoading ? (
            <Loader2 className="animate-spin text-white/30" />
          ) : user && !user.features?.includes(store.permission) ? (
            <p>{t("Activate your account to import games.")}</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="font-bold">
                {t(store.messages.inputLabel)}
                <input
                  type={store.input.type}
                  required
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={store.input.placeholder}
                  className="mt-2 w-full rounded-xl border border-white/20 bg-black/20 p-3 text-sm"
                />
              </label>
              {store.messages.hint && (
                <p className="text-sm text-white/50">
                  {t(store.messages.hint)}
                </p>
              )}
              {error && (
                <p role="alert" className="text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !user || !input.trim()}
                className="rounded-xl bg-violet-500 p-3 font-black disabled:opacity-50"
              >
                {t(busy ? "Update in progress" : "Add to catalog")}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
