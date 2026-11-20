import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowLeft } from "lucide-react";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { GiftCardCatalog } from "components/store/GiftCardCatalog";
import { useI18n } from "lib/i18n";
import { giftCardsEnabled } from "infra/runtime";

export default function GiftCardStorePage() {
  const { t } = useI18n();
  return (
    <>
      <Head>
        <title>{t("Gift cards | Manifold")}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-24 pt-8 sm:px-6 lg:px-10 lg:pb-12">
        <Link
          href="/store"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 hover:text-white"
        >
          <ArrowLeft size={16} />
          {t("Back to store")}
        </Link>
        <div className="mt-6">
          <GiftCardCatalog />
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps() {
  if (!giftCardsEnabled()) return { notFound: true };
  return { props: {} };
}

GiftCardStorePage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
