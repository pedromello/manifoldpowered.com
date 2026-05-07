import Head from "next/head";
import Link from "next/link";
import useSWR from "swr";
import { BookMarked, Layers, PackageX } from "lucide-react";

import { StoreLayout } from "components/store/StoreLayout";
import { SectionDivider } from "components/store/SectionDivider";
import { LibraryGameCard } from "components/library/LibraryGameCard";
import { type GameApi } from "components/store/GameListItem";

export default function LibraryPage() {
  const {
    data: libraryData,
    error,
    isLoading,
  } = useSWR(
    "/api/v1/library",
    (url) =>
      fetch(url).then(async (res) => {
        if (!res.ok) throw new Error("Not logged in");
        return res.json();
      }),
    { shouldRetryOnError: false },
  );

  const isLoggedOut = !!error;
  const games = libraryData?.games || [];

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      <Head>
        <title>My Library | Manifold Store</title>
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <style jsx global>{`
        html,
        body {
          background-color: #1d0f3b !important;
        }
      `}</style>

      <main className="w-full pt-28 lg:pt-36 flex flex-col items-center">
        <div className="w-full max-w-7xl mx-auto px-6 md:px-10 flex flex-col gap-12">
          <header className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 w-fit text-white/80 backdrop-blur-sm">
              <BookMarked size={16} />
              <span className="text-xs font-black tracking-widest uppercase">
                Personal Archives
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white drop-shadow-2xl">
              My Library
            </h1>
            <p className="text-xl text-white/50 font-bold max-w-2xl">
              Access your secured digital assets. Download, manage, and play
              your collection.
            </p>
          </header>

          <SectionDivider />

          {isLoggedOut ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white/5 border border-white/10 rounded-[2rem] backdrop-blur-md">
              <Layers size={64} className="text-white/20 mb-6" />
              <h2 className="text-3xl font-black mb-4">
                Authentication Required
              </h2>
              <p className="text-white/50 font-bold max-w-md mb-8">
                You must be logged in to access your personal library and
                download games.
              </p>
              <Link
                href="/login?callbackUrl=/library"
                className="px-8 py-4 rounded-xl bg-white text-black font-black uppercase tracking-wider hover:scale-105 transition-transform"
              >
                Log In to Manifold
              </Link>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white/20 mb-6"></div>
              <p className="text-xl font-bold text-white/40 tracking-widest uppercase">
                Decrypting Archives...
              </p>
            </div>
          ) : games.length > 0 ? (
            <div className="flex flex-col gap-6 animate-in fade-in duration-1000">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-white/40 uppercase tracking-widest">
                  {games.length} {games.length === 1 ? "Title" : "Titles"}{" "}
                  Available
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {games.map(
                  (item: {
                    id: string;
                    acquired_at: string;
                    game: GameApi;
                  }) => (
                    <LibraryGameCard key={item.id} gameItem={item} />
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 px-4 text-center border border-white/5 rounded-[2rem] bg-black/20">
              <PackageX size={64} className="text-white/10 mb-6" />
              <h2 className="text-3xl font-black mb-4 text-white/80">
                Empty Sector
              </h2>
              <p className="text-white/40 font-bold max-w-md mb-8">
                You haven&apos;t added any games to your library yet. Discover
                your next adventure in the store.
              </p>
              <Link
                href="/store"
                className="px-8 py-4 rounded-xl border border-white/20 text-white font-black uppercase tracking-wider hover:bg-white hover:text-black transition-all"
              >
                Browse Store
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

LibraryPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
