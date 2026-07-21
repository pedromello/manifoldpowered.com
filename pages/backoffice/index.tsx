import Head from "next/head";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";

export default function BackofficeIndexPage() {
  return (
    <>
      <Head>
        <title>Backoffice | Manifold</title>
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <h1 className="text-3xl font-black mb-2">Dashboard</h1>
      <p className="text-white/50 font-bold">
        Metrics land here in a follow-up task.
      </p>
    </>
  );
}

BackofficeIndexPage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
