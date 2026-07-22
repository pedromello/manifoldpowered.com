import { useRouter } from "next/router";
import Link from "next/link";
import useSWR from "swr";
import { Loader2, Settings } from "lucide-react";

import { StoreLayout } from "components/store/StoreLayout";
import { Storefront } from "components/store/Storefront";

interface StoreApi {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
}

interface CurrentUser {
  id: string;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Not found");
    return res.json();
  });

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function StorePage() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;

  const {
    data: store,
    isLoading,
    error,
  } = useSWR<StoreApi>(slug ? `/api/v1/stores/${slug}` : null, fetcher);

  const { data: currentUser } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );

  if (isLoading || !slug) {
    return (
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={32} />
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center">
        <p className="text-rose-300 font-bold">Store not found.</p>
      </div>
    );
  }

  return (
    <StoreLayout
      store={{
        slug: store.slug,
        name: store.name,
        logo_url: store.logo_url,
      }}
    >
      <Storefront
        featuredEndpoint={`/api/v1/stores/${store.slug}/featured`}
        listEndpoint={`/api/v1/stores/${store.slug}/search`}
        browsePath={`/store/${store.slug}`}
        searchPagePath={`/store/${store.slug}`}
        pageTitle={`${store.name} | Manifold Store`}
        metaDescription={
          store.description ||
          `Explore ${store.name}'s curated catalog on Manifold.`
        }
        heading={store.name}
        storeSlug={store.slug}
      />

      {currentUser?.id === store.owner_id && (
        <Link
          href={`/store/${store.slug}/manage`}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-black font-black text-sm uppercase tracking-wider shadow-2xl hover:bg-white/90 transition-colors"
        >
          <Settings size={16} />
          Manage Store
        </Link>
      )}
    </StoreLayout>
  );
}
