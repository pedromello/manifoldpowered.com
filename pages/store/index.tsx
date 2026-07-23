// --- Components ---
import { StoreLayout } from "components/store/StoreLayout";
import { Storefront } from "components/store/Storefront";

export default function StoreOption2() {
  return (
    <Storefront
      featuredEndpoint="/api/v1/games"
      listEndpoint="/api/v1/games"
      browsePath="/store"
      searchPagePath="/search"
      pageTitle="Discover (Dark) | Manifold Outlets"
      metaDescription="Explore the best games curated by the community in premium dark mode."
    />
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
