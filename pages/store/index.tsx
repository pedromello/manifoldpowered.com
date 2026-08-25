import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { Storefront } from "components/store/Storefront";

export default function StoreOption2() {
  return (
    <Storefront
      featuredEndpoint="/api/v1/games"
      listEndpoint="/api/v1/games"
      browsePath="/store"
      searchPagePath="/search"
      pageTitle="Manifold | One library, endless storefronts"
      metaDescription="Discover creator-curated game storefronts, publish once across the Manifold network, or launch an Outlet for your community."
      heading="Explore the shared catalog"
      showDiscover
      showPlatformWelcome
    />
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
