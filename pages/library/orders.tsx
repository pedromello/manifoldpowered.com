import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowLeft } from "lucide-react";

import { OrdersPrototype } from "components/orders/OrdersPrototype";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";

export default function OrdersPage() {
  const { t } = useI18n();
  return (
    <>
      <Head>
        <title>{t("My orders")} | Manifold</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-24 pt-8 text-white sm:px-6 lg:px-10 lg:pb-12">
        <Link
          href="/library"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t("Back to library")}
        </Link>
        <aside
          aria-label={t("Prototype")}
          className="mt-6 flex flex-col justify-between gap-3 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 py-3 text-xs leading-5 text-violet-200/75 sm:flex-row sm:items-center"
        >
          <p>
            <strong className="font-semibold">{t("Prototype")}</strong>
            {" · "}
            {t(
              "Example orders. Buttons open details without making purchases.",
            )}
          </p>
          <Link
            href="/library/purchases"
            className="shrink-0 font-semibold underline underline-offset-4 hover:text-white"
          >
            {t("See actual purchase history")}
          </Link>
        </aside>
        <OrdersPrototype />
      </main>
    </>
  );
}

export async function getServerSideProps() {
  if (!["development", "test"].includes(process.env.NODE_ENV))
    return { notFound: true };
  return { props: {} };
}

OrdersPage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
