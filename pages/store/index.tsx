import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { Storefront } from "components/store/Storefront";
import { useI18n } from "lib/i18n";
import { homeJsonLd, homeMetadata, socialImageUrl } from "lib/seo";

export default function StoreOption2() {
  const { locale } = useI18n();
  const metadata = homeMetadata(locale);
  return (
    <Storefront
      featuredEndpoint="/api/v1/games"
      listEndpoint="/api/v1/games"
      browsePath="/store"
      searchPagePath="/search"
      pageTitle={metadata.title}
      metaDescription={metadata.description}
      canonicalPath="/store"
      socialImage={socialImageUrl("home", locale)}
      socialImageAlt={
        locale === "pt-BR"
          ? "Manifold, um catálogo compartilhado de jogos com Outlets de criadores"
          : "Manifold, one shared game catalog with creator-run Outlets"
      }
      jsonLd={homeJsonLd(locale)}
      showDiscover
    />
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
