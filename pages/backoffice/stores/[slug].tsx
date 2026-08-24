import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import { useI18n } from "lib/i18n";

interface BackofficeStore {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not found");
    return res.json();
  });

export default function BackofficeStoreDetailPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { slug } = router.query;

  const key = slug ? `/api/v1/backoffice/stores/${slug}` : null;
  const {
    data: store,
    isLoading,
    error,
  } = useSWR<BackofficeStore>(key, fetcher);

  return (
    <>
      <Head>
        <title>
          {store
            ? t("{name} | Manifold Admin", { name: store.name })
            : t("Outlet | Manifold Admin")}
        </title>
      </Head>

      <div className="flex flex-col gap-6 max-w-2xl">
        <Link
          href="/backoffice/stores"
          className="flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          {t("Back to Outlets")}
        </Link>

        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error || !store ? (
          <p className="text-rose-300 font-bold">{t("Outlet not found.")}</p>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div>
              <h1 className="text-3xl font-black">{store.name}</h1>
              {store.description && (
                <p className="text-white/50 font-bold mt-1">
                  {store.description}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                  {t("Outlet ID")}
                </div>
                <div className="text-white/70 font-mono text-xs break-all">
                  {store.id}
                </div>
              </div>
              <div>
                <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                  {t("Created")}
                </div>
                <div className="text-white/70 font-bold">
                  {new Date(store.created_at).toLocaleString(locale)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

BackofficeStoreDetailPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
