import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { Storefront } from "components/store/Storefront";
import { useI18n } from "lib/i18n";

export default function StoreOption2() {
  const { t } = useI18n();
  return (
    <Storefront
      featuredEndpoint="/api/v1/games"
      listEndpoint="/api/v1/games"
      browsePath="/store"
      searchPagePath="/search"
      pageTitle={t("Manifold | One library, endless storefronts")}
      metaDescription={t(
        "Discover creator-curated game storefronts, publish once across the Manifold network, or launch an Outlet for your community.",
      )}
      heading={t("Explore the shared catalog")}
      showDiscover
      showPlatformWelcome
    />
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
