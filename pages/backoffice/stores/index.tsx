import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import useSWR from "swr";
import { Loader2, Search } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";

interface BackofficeStore {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
}

interface StoresResponse {
  stores: BackofficeStore[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BackofficeStoresPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = new URLSearchParams();
  if (query.trim()) queryParams.set("q", query.trim());
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");

  const key = `/api/v1/backoffice/stores?${queryParams.toString()}`;
  const { data, isLoading, error } = useSWR<StoresResponse>(key, fetcher);

  const stores = data?.stores ?? [];
  const pagination = data?.pagination;

  return (
    <>
      <Head>
        <title>Stores | Manifold Admin</title>
      </Head>

      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-black">Stores</h1>

        <div className="relative max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="text"
            placeholder="Search by name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
          />
        </div>

        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={2} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin inline-block text-white/30" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-12 text-center text-rose-300 font-bold"
                  >
                    Failed to load stores.
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-12 text-center text-white/40 font-bold"
                  >
                    No stores found.
                  </td>
                </tr>
              ) : (
                stores.map((storeItem) => (
                  <tr key={storeItem.id} className="border-t border-white/5">
                    <td className="px-4 py-3 font-bold text-white">
                      <Link
                        href={`/backoffice/stores/${storeItem.slug}`}
                        className="hover:underline"
                      >
                        {storeItem.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/40">
                      {new Date(storeItem.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-sm font-bold text-white/50">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}

BackofficeStoresPage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
