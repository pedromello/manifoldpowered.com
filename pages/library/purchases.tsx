import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Receipt, Layers, PackageX, Store as StoreIcon } from "lucide-react";

import { StoreLayout } from "components/store/StoreLayout";
import { SectionDivider } from "components/store/SectionDivider";
import { Pagination, type PaginationApi } from "components/Pagination";
import { formatMoney } from "lib/price";

interface PurchaseApi {
  id: string;
  game_id: string;
  game_title: string;
  game_slug: string | null;
  store_id: string | null;
  price_at_sale: string;
  currency: string;
  created_at: string;
}

// A buyer's own purchase history.
//
// Deliberately separate from /library, which answers "what do I own" and shows
// each game's *current* list price. This answers "what did I pay", which is
// only reconstructible from Sale: the amount charged, in the currency it was
// charged in, on the day it was charged.
export default function PurchasesPage() {
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useSWR<{
    purchases: PurchaseApi[];
    pagination: PaginationApi;
  }>(
    `/api/v1/user/purchases?page=${page}`,
    (url: string) =>
      fetch(url).then(async (res) => {
        if (!res.ok) throw new Error("Not logged in");
        return res.json();
      }),
    { shouldRetryOnError: false },
  );

  const isLoggedOut = !!error;
  const purchases = data?.purchases ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      <Head>
        <title>Purchase History | Manifold Outlets</title>
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <style jsx global>{`
        html,
        body {
          background-color: #1d0f3b !important;
        }
      `}</style>

      <main className="w-full pt-[calc(env(safe-area-inset-top)+7rem)] lg:pt-[calc(env(safe-area-inset-top)+9rem)] flex flex-col items-center">
        <div className="w-full max-w-4xl mx-auto px-6 md:px-10 flex flex-col gap-12">
          <header className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 w-fit text-white/80 backdrop-blur-sm">
              <Receipt size={16} />
              <span className="text-xs font-black tracking-widest uppercase">
                Transaction Record
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white drop-shadow-2xl">
              Purchase History
            </h1>
            <p className="text-xl text-white/50 font-bold max-w-2xl">
              What you paid, in the currency you were charged, and where you
              bought it.
            </p>
            <Link
              href="/library"
              className="w-fit text-sm font-black uppercase tracking-wider text-white/50 hover:text-white transition-colors"
            >
              ← Back to my library
            </Link>
          </header>

          <SectionDivider />

          {isLoggedOut ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white/5 border border-white/10 rounded-[2rem] backdrop-blur-md">
              <Layers size={64} className="text-white/20 mb-6" />
              <h2 className="text-3xl font-black mb-4">
                Authentication Required
              </h2>
              <p className="text-white/50 font-bold max-w-md mb-8">
                You must be logged in to view your purchase history.
              </p>
              <Link
                href="/login?callbackUrl=/library/purchases"
                className="px-8 py-4 rounded-xl bg-white text-black font-black uppercase tracking-wider hover:scale-105 transition-transform"
              >
                Log In to Manifold
              </Link>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white/20 mb-6"></div>
              <p className="text-xl font-bold text-white/40 tracking-widest uppercase">
                Retrieving Records...
              </p>
            </div>
          ) : purchases.length > 0 ? (
            <div className="flex flex-col gap-6 animate-in fade-in duration-1000">
              <span className="text-sm font-black text-white/40 uppercase tracking-widest">
                {total} {total === 1 ? "Purchase" : "Purchases"}
              </span>

              <div className="rounded-2xl border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                    {/* "Bought through" is dropped below sm. Four columns do
                        not fit a phone, and the container scrolls from the
                        right — so keeping it would push "Paid", the column
                        someone opens this page for, off the visible edge. */}
                    <tr>
                      <th className="px-4 py-3 text-left">Game</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-left">
                        Bought through
                      </th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr
                        key={purchase.id}
                        className="border-t border-white/5 align-middle"
                      >
                        <td className="px-4 py-3 font-bold text-white">
                          {purchase.game_slug ? (
                            <Link
                              href={`/item/${purchase.game_slug}`}
                              className="hover:underline"
                            >
                              {purchase.game_title}
                            </Link>
                          ) : (
                            purchase.game_title
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-white/40 whitespace-nowrap">
                          {purchase.store_id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <StoreIcon size={14} />
                              An outlet
                            </span>
                          ) : (
                            "Manifold"
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/40 whitespace-nowrap">
                          {new Date(purchase.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-emerald-300 whitespace-nowrap">
                          {formatMoney(
                            purchase.price_at_sale,
                            purchase.currency,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                pagination={data?.pagination}
                onPageChange={setPage}
              />

              <p className="text-white/30 text-xs font-bold">
                Manifold is the seller for every purchase above. Outlets are
                storefronts that referred you; your contract of sale is with
                Manifold.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 px-4 text-center border border-white/5 rounded-[2rem] bg-black/20">
              <PackageX size={64} className="text-white/10 mb-6" />
              <h2 className="text-3xl font-black mb-4 text-white/80">
                No Purchases Yet
              </h2>
              <p className="text-white/40 font-bold max-w-md mb-8">
                Anything you buy will show up here with the price you paid.
              </p>
              <Link
                href="/store"
                className="px-8 py-4 rounded-xl border border-white/20 text-white font-black uppercase tracking-wider hover:bg-white hover:text-black transition-all"
              >
                Browse Outlets
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

PurchasesPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
