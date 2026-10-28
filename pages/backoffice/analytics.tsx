import Head from "next/head";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import { OutletOutboundAnalytics } from "components/creator/OutletOutboundAnalytics";
import { useI18n } from "lib/i18n";

export default function OutboundAnalyticsPage() {
  const { t } = useI18n();
  return (
    <>
      <Head>
        <title>{t("Store clicks")} | Manifold</title>
      </Head>
      <OutletOutboundAnalytics global />
    </>
  );
}
OutboundAnalyticsPage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
