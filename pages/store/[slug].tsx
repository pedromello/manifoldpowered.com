import { useRouter } from "next/router";
import useSWR from "swr";
import { Loader2 } from "lucide-react";

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

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Not found");
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
      />
    </StoreLayout>
  );
}
