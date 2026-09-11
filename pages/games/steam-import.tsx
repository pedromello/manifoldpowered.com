import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { extractSteamAppId } from "lib/steam";
import { useI18n } from "lib/i18n";
import {
  requestExternalImport,
  externalImportErrorMessage,
} from "lib/external_import_client";

interface CurrentUser {
  id: string;
  username: string;
  features?: string[];
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function CommunitySteamImportPage() {
  const router = useRouter();
  const { t, translateError, locale } = useI18n();
  const {
    data: user,
    error: userError,
    isLoading,
  } = useSWR<CurrentUser>("/api/v1/user", userFetcher, {
    shouldRetryOnError: false,
  });
  const [input, setInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!isLoading && userError)
      void router.replace(
        `/login?callbackUrl=${encodeURIComponent(router.asPath)}`,
      );
  }, [isLoading, userError, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const steamAppId = extractSteamAppId(input);
    if (!steamAppId) {
      setFormError(
        t(
          "Enter a valid Steam store link (e.g. https://store.steampowered.com/app/400/) or a numeric App ID.",
        ),
      );
      return;
    }

    setIsSubmitting(true);
    controller.current = new AbortController();
    try {
      const body = await requestExternalImport(
        "steam",
        steamAppId,
        locale,
        () => {},
        controller.current.signal,
      );
      await router.push(`/item/${body.slug}`);
    } catch (error) {
      const message = externalImportErrorMessage(error, "steam");
      setFormError(translateError(message, "Steam import failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{`${t("Import from Steam")} | Manifold`}</title>
      </Head>
      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black">
              {t("Add a game from Steam")}
            </h1>
            <p className="text-white/50 text-sm font-bold mt-1">
              {t(
                "It will join the public catalog as an unclaimed game. Importing it does not give you ownership.",
              )}
            </p>
          </div>

          {isLoading ? (
            <Loader2 className="animate-spin text-white/30" />
          ) : user && !user.features?.includes("import:steam_game") ? (
            <p>{t("Activate your account to import games.")}</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  {t("Steam store link or App ID")}
                </span>
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://store.steampowered.com/app/400/Portal/"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
                />
              </label>

              {formError && (
                <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !input.trim()}
                className="px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t(isSubmitting ? "Update in progress" : "Add to catalog")}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
