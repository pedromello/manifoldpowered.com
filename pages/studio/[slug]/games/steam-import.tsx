import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { extractSteamAppId } from "lib/steam";
import { useI18n } from "lib/i18n";

interface CurrentUser {
  id: string;
  username: string;
}

interface Studio {
  id: string;
  slug: string;
  name: string;
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function StudioSteamImportPage() {
  const router = useRouter();
  const { t, translateError } = useI18n();
  const slug = router.query.slug as string | undefined;

  const { error: userError, isLoading: isUserLoading } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );

  const { data: studio, isLoading: isStudioLoading } = useSWR<Studio>(
    slug ? `/api/v1/studios/${slug}` : null,
    fetcher,
  );

  const [input, setInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLoggedOut = !!userError;

  if (!isUserLoading && isLoggedOut && slug) {
    router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!studio) return;

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
    try {
      const response = await fetch("/api/v1/items/games/steam-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio_id: studio.id,
          steam_app_id: steamAppId,
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(
          translateError(body?.message, "Failed to import game from Steam."),
        );
        return;
      }

      router.push(`/item/${body.slug}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Import from Steam | Manifold")}</title>
      </Head>

      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812] px-4 py-10 text-white sm:px-6">
        <div className="flex w-full max-w-xl flex-col gap-6 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 sm:p-8">
          <div>
            <h1 className="text-2xl font-black">{t("Import from Steam")}</h1>
            {studio && (
              <p className="text-white/50 text-sm font-bold mt-1 break-words">
                {t("Importing into {name}", { name: studio.name })}
              </p>
            )}
          </div>

          {isUserLoading || isStudioLoading ? (
            <Loader2 className="animate-spin text-white/30" />
          ) : !studio ? (
            <p className="text-rose-300 font-bold">{t("Studio not found.")}</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  {t("Steam store link or App ID")}
                </span>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
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
                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? t("Importing...") : t("Import Game")}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

StudioSteamImportPage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
