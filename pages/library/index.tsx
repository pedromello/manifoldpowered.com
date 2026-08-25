import Head from "next/head";
import Link from "next/link";
import useSWR from "swr";
import { BookMarked, PackageX, Receipt } from "lucide-react";

import { LibraryGameCard } from "components/library/LibraryGameCard";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import type { GameApi } from "components/store/types";
import { useI18n } from "lib/i18n";

type LibraryItem = {
  id: string;
  acquired_at: string;
  game: GameApi;
};

export default function LibraryPage() {
  const { locale, t } = useI18n();
  const {
    data: libraryData,
    error,
    isLoading,
  } = useSWR<{ games: LibraryItem[] }>(
    "/api/v1/library",
    (url) =>
      fetch(url).then(async (response) => {
        if (!response.ok) throw new Error("Not logged in");
        return response.json();
      }),
    { shouldRetryOnError: false },
  );

  const isLoggedOut = !!error;
  const games = libraryData?.games ?? [];

  return (
    <div className="min-h-screen bg-[#0b0812] pb-16 text-white lg:pb-0">
      <Head>
        <title>{t("My Library | Manifold")}</title>
        <meta name="theme-color" content="#0b0812" />
      </Head>

      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <header className="flex flex-col gap-6 border-b border-white/[0.08] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-violet-300">
              <BookMarked size={15} />
              {t("Your collection")}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              {t("My Library")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/45">
              {t(
                "Every game you acquire through Manifold, ready to download from one place.",
              )}
            </p>
          </div>

          {!isLoggedOut && (
            <Link
              href="/library/purchases"
              className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/60 hover:border-white/20 hover:text-white"
            >
              <Receipt size={16} />
              {t("Purchase history")}
            </Link>
          )}
        </header>

        {isLoggedOut ? (
          <section className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-xl border border-white/[0.09] bg-[#14101c] px-6 text-center">
            <BookMarked size={38} className="text-white/20" />
            <h2 className="mt-5 text-2xl font-black">
              {t("Log in to see your games")}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/45">
              {t(
                "Your library is tied to your Manifold account, no matter which Outlet introduced you to a game.",
              )}
            </p>
            <Link
              href="/login?callbackUrl=/library"
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-sm font-bold hover:from-fuchsia-500 hover:to-violet-500"
            >
              {t("Log in to Manifold")}
            </Link>
          </section>
        ) : isLoading ? (
          <div
            className="grid gap-4 pt-8 lg:grid-cols-2"
            aria-label={t("Loading library")}
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.035]"
              />
            ))}
          </div>
        ) : games.length > 0 ? (
          <section className="pt-8">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-semibold text-white/40">
                {t(games.length === 1 ? "{count} game" : "{count} games", {
                  count: games.length.toLocaleString(locale),
                })}
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {games.map((item) => (
                <LibraryGameCard key={item.id} gameItem={item} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center">
            <PackageX size={38} className="text-white/15" />
            <h2 className="mt-5 text-2xl font-black">
              {t("Your library is empty")}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/40">
              {t(
                "Find a game through Manifold or an independent Outlet. It will appear here after acquisition.",
              )}
            </p>
            <Link
              href="/store"
              className="mt-6 inline-flex h-10 items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/65 hover:border-white/30 hover:text-white"
            >
              {t("Browse games")}
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

LibraryPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
