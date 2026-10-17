import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { Storefront } from "components/store/Storefront";
import { useI18n } from "lib/i18n";
import { homeJsonLd, homeMetadata, socialImageUrl } from "lib/seo";
import type { GetServerSideProps } from "next";
import webserver from "infra/webserver";
import { headersForInternalFetch } from "lib/internal-fetch";
import { fetchPageData } from "lib/page-data";
import type { SelectionPageApi } from "lib/selection-client";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const url = new URL(
    "/api/v1/public/selections?limit=3",
    webserver.getOrigin(),
  );
  url.searchParams.set("locale", context.locale === "pt-BR" ? "pt-BR" : "en");
  try {
    const data = await fetchPageData<{ selections: SelectionPageApi[] }>(
      url.href,
      {
        headers: headersForInternalFetch(context.req.headers),
      },
    );
    return { props: { editorialSelections: data?.selections ?? [] } };
  } catch {
    // Discovery is optional; the working shared catalog remains available.
    return { props: { editorialSelections: [] } };
  }
};

export default function StoreOption2({
  editorialSelections = [],
}: {
  editorialSelections?: SelectionPageApi[];
}) {
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
      editorialSelections={editorialSelections}
    />
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
