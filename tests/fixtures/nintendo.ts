import type { NintendoCountry } from "lib/nintendo";

/** Reduced public page structure, including decoys before the selected product. */
export function nintendoHtml(
  country: NintendoCountry = "BR",
  overrides: Record<string, unknown> = {},
) {
  const product = {
    nsuid: "70010000003208",
    name: country === "BR" ? "Cavaleiro de Teste" : "Test Knight",
    urlKey: "test-knight-switch",
    locale: country === "BR" ? "pt_BR" : "en_US",
    platform: { code: "NINTENDO_SWITCH", label: "Nintendo Switch" },
    topLevelCategory: { code: "GAMES" },
    isUpgrade: false,
    dlcType: null,
    description:
      country === "BR" ? "Uma aventura de teste." : "A test adventure.",
    headline: country === "BR" ? "Explore cavernas" : "Explore caves",
    releaseDate: "2020-12-03T00:00:00Z",
    softwareDeveloper: "Team Cherry",
    softwarePublisher: "Team Cherry",
    supportedLanguages: ["English", "Brazilian Portuguese"],
    tags: { genres: [{ label: "Adventure" }] },
    productImage: {
      publicId: "store/software/switch/70010000003208/cover",
      resourceType: "image",
    },
    productGallery: [
      {
        publicId: "store/software/switch/70010000003208/screenshot",
        resourceType: "image",
      },
      {
        publicId: "store/software/switch/70010000003208/Video/trailer",
        resourceType: "video",
      },
    ],
    'prices({"personalized":false})': {
      currency: country === "BR" ? "BRL" : "USD",
      regularPrice: country === "BR" ? 60 : 15,
      finalPrice: country === "BR" ? 30 : 15,
    },
    ...overrides,
  };
  const data = {
    props: {
      pageProps: {
        initialApolloState: {
          "Product:decoy": {
            nsuid: "70050000069063",
            name: "Upgrade pack",
            isUpgrade: true,
          },
          "Product:selected": product,
          ROOT_QUERY: {
            [`product(${JSON.stringify({ input: { urlKey: product.urlKey } })})`]:
              { __ref: "Product:selected" },
          },
        },
      },
    },
  };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}
