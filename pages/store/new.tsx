import Head from "next/head";

import { CreatorOutletOnboarding } from "components/creator/CreatorOutletOnboarding";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { useI18n } from "lib/i18n";

export default function StoreCreatePage() {
  const { t } = useI18n();

  return (
    <>
      <Head>
        <title>{t("Create your Outlet | Manifold")}</title>
      </Head>
      <CreatorOutletOnboarding />
    </>
  );
}

StoreCreatePage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
