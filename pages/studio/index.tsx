import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";

interface Studio {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
}

interface StudiosResponse {
  studios: Studio[];
}

interface CurrentUser {
  id: string;
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

  const { data: currentUser } = useSWR<CurrentUser>("/api/v1/user", fetcher, {
    shouldRetryOnError: false,
  });

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

      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812] px-4 py-10 text-white sm:px-6">
        {isLoading || (!error && studios.length <= 1) ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : (
          <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 sm:p-8">
            <div>
              <h1 className="text-2xl font-black">Choose a Studio</h1>
              <p className="text-white/50 text-sm font-bold mt-1">
                Pick which one to open.
              </p>
            </div>
            {studios.map((studio) => (
              <Link
                key={studio.id}
                href={`/studio/${studio.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 font-bold text-white transition-colors hover:border-violet-400/30 hover:bg-white/[0.07]"
              >
                <span className="truncate">{studio.name}</span>
                {currentUser && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/10 text-white/60 text-xs font-black uppercase tracking-wider">
                    {studio.owner_id === currentUser.id ? "Owner" : "Member"}
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

MyStudiosPage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
