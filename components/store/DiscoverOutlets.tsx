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
    <section className="w-full border-t border-white/[0.08] py-12 md:py-16">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-8 px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-3 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-white/35">
            Independent storefronts
          </p>
          <h2 className="text-2xl font-black tracking-[-0.02em] md:text-3xl">
            Discover Outlets
          </h2>
          <p className="text-sm leading-6 text-white/45">
            Browse storefronts curated by creators across Manifold — each with
            its own taste, its own picks, and the same catalog behind it.
          </p>
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/30" />
          </div>
        ) : outlets.length === 0 ? (
          <p className="text-sm font-semibold text-white/30">
            No other outlets to show yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outlets.map((outlet) => (
              <Link
                key={outlet.id}
                href={`/store/${outlet.slug}`}
                className="flex min-w-0 items-center gap-4 rounded-xl border border-white/[0.09] bg-[#14101c] p-4 transition-colors hover:border-white/20 hover:bg-[#181320]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.07]">
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
                  <p className="truncate font-bold text-white">{outlet.name}</p>
                  {outlet.description && (
                    <p className="line-clamp-2 text-sm text-white/45">
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
