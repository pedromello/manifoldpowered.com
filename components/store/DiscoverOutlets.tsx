import Link from "next/link";
import useSWR from "swr";

interface PublicOutlet {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
}

interface PublicOutletsResponse {
  stores: PublicOutlet[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Renders at the bottom of the MAIN storefront only (gated by the Storefront
// `showDiscover` prop) so shoppers can find other creators' outlets. Data
// comes from the public GET /api/v1/public/stores listing.
export function DiscoverOutlets() {
  const { data, isLoading } = useSWR<PublicOutletsResponse>(
    "/api/v1/public/stores?limit=12",
    fetcher,
  );

  const outlets = data?.stores ?? [];

  return (
    <section className="w-full py-12 md:py-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col gap-8">
        <div className="flex flex-col gap-3 max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-black">
            Discover other Outlets
          </h2>
          <p className="text-white/50 font-bold">
            Browse storefronts curated by creators across Manifold — each with
            its own taste, its own picks, and the same catalog behind it.
          </p>
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/30" />
          </div>
        ) : outlets.length === 0 ? (
          <p className="text-white/30 font-bold italic">
            No other outlets to show yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outlets.map((outlet) => (
              <Link
                key={outlet.id}
                href={`/store/${outlet.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors min-w-0"
              >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-white/10 overflow-hidden flex items-center justify-center">
                  {outlet.logo_url ? (
                    // Outlet logos are arbitrary user-supplied URLs, so next/image
                    // (host-allowlisted) can't be used here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={outlet.logo_url}
                      alt={`${outlet.name} logo`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-black text-white/60">
                      {outlet.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-white truncate">
                    {outlet.name}
                  </p>
                  {outlet.description && (
                    <p className="text-sm font-bold text-white/50 line-clamp-2">
                      {outlet.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
