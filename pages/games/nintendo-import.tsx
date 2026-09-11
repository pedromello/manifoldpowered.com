import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { useI18n } from "lib/i18n";
import { parseNintendoUrl } from "lib/nintendo";
import {
  requestNintendoImport,
  nintendoImportErrorMessage,
} from "lib/nintendo_import_client";

const userFetcher = async (
  url: string,
): Promise<{ features?: string[] } | null> => {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
};

export default function NintendoImportPage() {
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
    setError(null);
    const parsed = parseNintendoUrl(input);
    if (!parsed) {
      setError(
        t("Copy a Brazilian or US product page link from www.nintendo.com."),
      );
      return;
    }
    setBusy(true);
    controller.current = new AbortController();
    try {
      const body = await requestNintendoImport(
        parsed.url,
        locale,
        () => {},
        controller.current.signal,
      );
      await router.push(`/item/${body.slug}`);
    } catch (error) {
      setError(
        translateError(
          nintendoImportErrorMessage(error),
          "Nintendo import failed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Head>
        <title>{`${t("Import from Nintendo eShop")} | Manifold`}</title>
      </Head>
      <main className="min-h-screen bg-[#1D0F3B] px-4 py-24 text-white">
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-black">
            {t("Import from Nintendo eShop")}
          </h1>
          <p className="my-5 text-white/65">
            {t(
              "Add Switch and Switch 2 games to the catalog to discover, recommend and review them.",
            )}
          </p>
          {!isLoading &&
          user &&
          !user.features?.includes("import:nintendo_game") ? (
            <p>{t("Activate your account to import games.")}</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="font-bold">
                {t("Nintendo eShop product link")}
                <input
                  type="url"
                  required
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://www.nintendo.com/pt-br/store/products/hollow-knight-switch/"
                  className="mt-2 w-full rounded-xl border border-white/20 bg-black/20 p-3 text-sm"
                />
              </label>
              <p className="text-sm text-white/50">
                {t(
                  "Use the link again to update an existing game. Purchases take place on Nintendo eShop.",
                )}
              </p>
              {error && (
                <p role="alert" className="text-rose-300">
                  {error}
                </p>
              )}
              <button
                disabled={busy || isLoading || !user}
                className="rounded-xl bg-violet-500 p-3 font-black disabled:opacity-50"
              >
                {t(busy ? "Importing..." : "Add to catalog")}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
