import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface Store {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
}

interface StoresResponse {
  stores: Store[];
}

interface CurrentUser {
  id: string;
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function MyStoresPage() {
  const router = useRouter();

  const { data, isLoading, error } = useSWR<StoresResponse>(
    "/api/v1/stores",
    fetcher,
    { shouldRetryOnError: false },
  );

  const { data: currentUser } = useSWR<CurrentUser>("/api/v1/user", fetcher, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (isLoading) return;

    if (error) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
      return;
    }

    const stores = data?.stores ?? [];

    if (stores.length === 0) {
      router.replace("/store/new");
    } else if (stores.length === 1) {
      router.replace(`/store/${stores[0].slug}`);
    }
  }, [isLoading, error, data, router]);

  const stores = data?.stores ?? [];

  return (
    <>
      <Head>
        <title>My Outlets | Manifold</title>
      </Head>

      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4">
        {isLoading || (!error && stores.length <= 1) ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : (
          <div className="w-full max-w-md flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-black">Choose an Outlet</h1>
              <p className="text-white/50 text-sm font-bold mt-1">
                Pick which one to open.
              </p>
            </div>
            {stores.map((storeItem) => (
              <Link
                key={storeItem.id}
                href={`/store/${storeItem.slug}`}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 font-bold text-white hover:bg-white/10 transition-colors"
              >
                <span className="truncate">{storeItem.name}</span>
                {currentUser && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/10 text-white/60 text-xs font-black uppercase tracking-wider">
                    {storeItem.owner_id === currentUser.id ? "Owner" : "Member"}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
