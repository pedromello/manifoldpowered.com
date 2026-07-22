import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface Studio {
  id: string;
  slug: string;
  name: string;
}

interface StudiosResponse {
  studios: Studio[];
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function MyStudiosPage() {
  const router = useRouter();

  const { data, isLoading, error } = useSWR<StudiosResponse>(
    "/api/v1/studios",
    fetcher,
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    if (isLoading) return;

    if (error) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
      return;
    }

    const studios = data?.studios ?? [];

    if (studios.length === 0) {
      router.replace("/onboarding/create");
    } else if (studios.length === 1) {
      router.replace(`/studio/${studios[0].slug}`);
    }
  }, [isLoading, error, data, router]);

  const studios = data?.studios ?? [];

  return (
    <>
      <Head>
        <title>My Studios | Manifold</title>
      </Head>

      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4">
        {isLoading || (!error && studios.length <= 1) ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : (
          <div className="w-full max-w-md flex flex-col gap-4">
            <h1 className="text-2xl font-black">My Studios</h1>
            {studios.map((studio) => (
              <Link
                key={studio.id}
                href={`/studio/${studio.slug}`}
                className="px-4 py-3 rounded-xl border border-white/10 bg-white/5 font-bold text-white hover:bg-white/10 transition-colors"
              >
                {studio.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
