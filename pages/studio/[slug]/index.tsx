import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { Loader2, Building2 } from "lucide-react";

interface Studio {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_publisher: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function StudioPage() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;

  const {
    data: studio,
    isLoading,
    error,
  } = useSWR<Studio>(slug ? `/api/v1/studios/${slug}` : null, fetcher);

  return (
    <>
      <Head>
        <title>
          {studio ? `${studio.name} | Manifold` : "Studio | Manifold"}
        </title>
      </Head>

      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4">
        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error || !studio ? (
          <p className="text-rose-300 font-bold">Studio not found.</p>
        ) : (
          <div className="w-full max-w-md flex flex-col gap-6">
            <div className="flex items-center gap-4">
              {studio.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={studio.logo_url}
                  alt={`${studio.name} logo`}
                  className="w-16 h-16 shrink-0 rounded-2xl object-cover border border-white/10 bg-white/5"
                />
              ) : (
                <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 text-white/30">
                  <Building2 size={28} />
                </div>
              )}

              <div className="min-w-0">
                <h1 className="text-2xl font-black break-words">
                  {studio.name}
                </h1>
                {studio.is_publisher && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-lg bg-white/10 text-white/60 text-xs font-black uppercase tracking-wider">
                    Publisher
                  </span>
                )}
              </div>
            </div>

            {studio.description && (
              <p className="text-white/70 text-sm leading-relaxed">
                {studio.description}
              </p>
            )}

            <Link
              href={`/studio/${studio.slug}/games/steam-import`}
              className="px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider text-center hover:bg-emerald-400 transition-colors"
            >
              Import a Game from Steam
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
