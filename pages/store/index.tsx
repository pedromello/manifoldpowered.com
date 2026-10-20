import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { ProductPageEvent } from "components/analytics/ProductPageEvent";
import { Storefront } from "components/store/Storefront";
import { useI18n } from "lib/i18n";
import { homeJsonLd, homeMetadata, socialImageUrl } from "lib/seo";
import type { GetServerSideProps } from "next";
import webserver from "infra/webserver";
import { headersForInternalFetch } from "lib/internal-fetch";
import { fetchPageData } from "lib/page-data";
import type { SelectionPageApi } from "lib/selection-client";
import type { HomeCommunity, PublicHome } from "contracts/home-editorial";

export const getServerSideProps: GetServerSideProps = async (context) => {
  context.res.setHeader("Cache-Control", "private, no-store");
  const url = new URL("/api/v1/public/home", webserver.getOrigin());
  url.searchParams.set("locale", context.locale === "pt-BR" ? "pt-BR" : "en");
  try {
    const data = await fetchPageData<PublicHome>(url.href, {
      headers: headersForInternalFetch(context.req.headers),
    });
    return {
      props: {
        editorialSelections: data?.selections ?? [],
        homeCommunities: data?.communities ?? [],
      },
    };
  } catch {
    // Discovery is optional; the working shared catalog remains available.
    return { props: { editorialSelections: [], homeCommunities: [] } };
  }
};

export default function StoreOption2({
  editorialSelections = [],
  homeCommunities = [],
}: {
  editorialSelections?: SelectionPageApi[];
  homeCommunities?: HomeCommunity[];
}) {
  const { locale } = useI18n();
  const metadata = homeMetadata(locale);
  return (
    <>
      <ProductPageEvent
        event={{
          name: "public_page_viewed",
          target: {},
          properties: {
            locale,
            entry_surface: "catalog",
            page_kind: "catalog",
          },
        }}
      />
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
        homeCommunities={homeCommunities}
      />
    </>
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
