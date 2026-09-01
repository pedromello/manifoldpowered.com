import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useEffect } from "react";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { fetchJson, isAuthenticationError } from "lib/api-client";
import { useI18n } from "lib/i18n";

interface Store {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  status?: "DRAFT" | "PUBLISHED";
  publication_status?: "DRAFT" | "PUBLISHED";
}

interface StoresResponse {
  stores: Store[];
}

interface CurrentUser {
  id: string;
}

export default function MyStoresPage() {
  const router = useRouter();
  const { t } = useI18n();

  const { data, isLoading, error, mutate } = useSWR<StoresResponse>(
    "/api/v1/stores",
    fetchJson,
    { shouldRetryOnError: false },
  );

  const { data: currentUser } = useSWR<CurrentUser>("/api/v1/user", fetchJson, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticationError(error)) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
      return;
    }

    const stores = data?.stores ?? [];

    if (stores.length === 0) {
      router.replace("/store/new");
    } else if (stores.length === 1) {
      router.replace(`/store/${stores[0].slug}/manage?tab=overview`);
    }
  }, [isLoading, error, data, router]);

  const stores = data?.stores ?? [];

  return (
    <>
      <Head>
        <title>{t("My Outlets | Manifold")}</title>
      </Head>

      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812] px-4 py-10 text-white sm:px-6">
        {isLoading || (!error && stores.length <= 1) ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error ? (
          <div
            role="alert"
            className="flex w-full max-w-xl flex-col items-start rounded-xl border border-rose-400/20 bg-rose-400/10 p-6"
          >
            <h1 className="text-xl font-black">
              {t("We couldn't load your Outlets")}
            </h1>
            <p className="mt-2 text-sm font-semibold text-white/50">
              {t("Your work is safe. Try loading the workspace again.")}
            </p>
            <button
              type="button"
              onClick={() => mutate()}
              className="mt-5 min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {t("Try again")}
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-black">{t("My Outlets")}</h1>
                <p className="text-white/50 text-sm font-bold mt-1">
                  {t("Continue a draft or open a live Outlet.")}
                </p>
              </div>
              <Link
                href="/store/new?new=1"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-black text-white"
              >
                <Plus size={16} /> {t("Create Outlet")}
              </Link>
            </div>
            {stores.map((storeItem) => (
              <Link
                key={storeItem.id}
                href={`/store/${storeItem.slug}/manage?tab=overview`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 font-bold text-white transition-colors hover:border-violet-400/30 hover:bg-white/[0.07]"
              >
                <span className="min-w-0">
                  <span className="block truncate">{storeItem.name}</span>
                  <span className="mt-1 block text-xs font-semibold text-white/40">
                    {(storeItem.status ?? storeItem.publication_status) ===
                    "PUBLISHED"
                      ? t("Published · Open Overview")
                      : t("Draft · Continue setup")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {currentUser && (
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white/60">
                      {storeItem.owner_id === currentUser.id
                        ? t("Owner")
                        : t("Member")}
                    </span>
                  )}
                  <ArrowRight size={16} className="text-violet-200" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

MyStoresPage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
