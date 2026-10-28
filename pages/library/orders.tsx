import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowLeft } from "lucide-react";

import { OrdersList } from "components/orders/OrdersList";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";
import { sandboxEnabled } from "infra/runtime";

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
        <header className="py-8">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            {t("My orders")}
          </h1>
          <p className="mt-3 text-sm text-white/55">
            {t("Track your game and gift card purchases.")}
          </p>
        </header>
        <OrdersList />
      </main>
    </>
  );
}

export async function getServerSideProps() {
  if (!sandboxEnabled()) return { notFound: true };
  return { props: {} };
}

OrdersPage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
