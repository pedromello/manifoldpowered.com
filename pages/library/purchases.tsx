import Head from "next/head";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import useSWR from "swr";
import { ArrowLeft, Loader2, PackageX, Receipt, Store } from "lucide-react";

import { Pagination, type PaginationApi } from "components/Pagination";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
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

export default function PurchasesPage() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useSWR<{
    purchases: PurchaseApi[];
    pagination: PaginationApi;
  }>(
    `/api/v1/user/purchases?page=${page}`,
    (url: string) =>
      fetch(url).then(async (response) => {
        if (!response.ok) throw new Error("Not logged in");
        return response.json();
      }),
    { shouldRetryOnError: false },
  );

  const purchases = data?.purchases ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <>
      <Head>
        <title>Purchase History | Manifold</title>
        <meta name="theme-color" content="#0b0812" />
      </Head>

      <main className="min-h-[70vh] bg-[#0b0812] px-4 py-10 text-white sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/library"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition-colors hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to library
          </Link>

          <header className="mt-7 border-b border-white/[0.08] pb-8">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-violet-300">
              <Receipt size={16} />
              Your account
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Purchase history
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
              The amount, currency, date, and referring Outlet recorded for each
              purchase.
            </p>
          </header>

          {error ? (
            <section className="mt-8 rounded-xl border border-white/[0.08] bg-[#14101c] px-6 py-14 text-center">
              <h2 className="text-xl font-bold">
                Log in to see your purchases
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">
                Purchase history is private and attached to your Manifold
                account.
              </p>
              <Link
                href="/login?callbackUrl=/library/purchases"
                className="mt-6 inline-flex rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-bold text-white"
              >
                Log in
              </Link>
            </section>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-sm font-semibold text-white/45">
              <Loader2 size={20} className="animate-spin" />
              Loading purchase history
            </div>
          ) : purchases.length > 0 ? (
            <section className="mt-8">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/35">
                {total} {total === 1 ? "purchase" : "purchases"}
              </p>

              <div className="overflow-x-auto rounded-xl border border-white/[0.09] bg-[#100c17]">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="border-b border-white/[0.08] bg-white/[0.025] text-left text-[10px] uppercase tracking-[0.13em] text-white/35">
                    <tr>
                      <th className="px-5 py-4">Game</th>
                      <th className="px-5 py-4">Bought through</th>
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr
                        key={purchase.id}
                        className="border-b border-white/[0.06] last:border-b-0"
                      >
                        <td className="px-5 py-4 font-semibold text-white/85">
                          {purchase.game_slug ? (
                            <Link
                              href={`/item/${purchase.game_slug}`}
                              className="hover:text-violet-200"
                            >
                              {purchase.game_title}
                            </Link>
                          ) : (
                            purchase.game_title
                          )}
                        </td>
                        <td className="px-5 py-4 text-white/45">
                          {purchase.store_id ? (
                            <span className="inline-flex items-center gap-2">
                              <Store size={14} />
                              An Outlet
                            </span>
                          ) : (
                            "Manifold"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-white/45">
                          {new Date(purchase.created_at).toLocaleDateString()}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-white/85">
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

              <div className="mt-6">
                <Pagination
                  pagination={data?.pagination}
                  onPageChange={setPage}
                />
              </div>

              <p className="mt-6 text-xs leading-5 text-white/28">
                Manifold is the seller for these purchases. An Outlet records
                who referred the purchase; your contract of sale is with
                Manifold.
              </p>
            </section>
          ) : (
            <section className="mt-8 flex flex-col items-center rounded-xl border border-white/[0.08] bg-[#14101c] px-6 py-14 text-center">
              <PackageX size={34} className="text-white/25" />
              <h2 className="mt-5 text-xl font-bold">No purchases yet</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/45">
                When you buy a game, the exact transaction will appear here.
              </p>
              <Link
                href="/store"
                className="mt-6 rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Browse games
              </Link>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

PurchasesPage.getLayout = function getLayout(page: ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
