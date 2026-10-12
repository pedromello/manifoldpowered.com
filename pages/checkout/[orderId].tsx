import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { ArrowLeft } from "lucide-react";
import { Checkout } from "components/checkout/Checkout";
import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";

export default function CheckoutPage() {
  const router = useRouter(),
    { t } = useI18n();
  return (
    <>
      <Head>
        <title>{t("Complete your purchase")} | Manifold</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-24 pt-8 text-white sm:px-6 lg:px-10">
        <Link
          href="/library/orders"
          className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"
        >
          <ArrowLeft size={16} />
          {t("My orders")}
        </Link>
        {typeof router.query.orderId === "string" && (
          <Checkout key={router.query.orderId} orderId={router.query.orderId} />
        )}
      </main>
    </>
  );
}
export async function getServerSideProps() {
  if (!["development", "test"].includes(process.env.NODE_ENV))
    return { notFound: true };
  return { props: {} };
}
CheckoutPage.getLayout = (page: ReactElement) => (
  <StoreHomeLayout>{page}</StoreHomeLayout>
);
