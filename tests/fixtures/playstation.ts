export const PLAYSTATION_ID = "UP0000-PPSA00001_00-0000000000000001";
export const OTHER_PLAYSTATION_ID = "UP0000-PPSA00001_00-0000000000000002";
export function playstationFixture(country: "BR" | "US" = "BR") {
  const id = PLAYSTATION_ID,
    sku = id + "-U001";
  return {
    props: {
      pageProps: {
        locale: country === "BR" ? "pt-br" : "en-us",
        productId: id,
        statusCode: 200,
      },
    },
    cache: {
      ["Product:" + OTHER_PLAYSTATION_ID]: {
        id: OTHER_PLAYSTATION_ID,
        name: "Unrelated upsell",
      },
      ["Product:" + id]: {
        id,
        name: "Orbit Tactics",
        topCategory: "GAME",
        storeDisplayClassification: "FULL_GAME",
        platforms: ["PS5"],
        publisherName: "Example Publisher",
        releaseDate: "2024-01-01T00:00:00Z",
        descriptions: [
          { type: "SHORT", value: "A space campaign." },
          { type: "LONG", value: "Plan your campaign.<br/>Choose your fleet." },
        ],
        media: [
          {
            type: "IMAGE",
            role: "MASTER",
            url: "https://image.api.playstation.com/vulcan/ap/rnd/example.png",
          },
        ],
        localizedGenres: [{ value: "Strategy" }],
        screenLanguages: ["en", "pt_BR"],
        spokenLanguages: ["en"],
        edition: { name: "Standard", type: "STANDARD" },
        skus: [{ __ref: "Sku:" + sku }],
        webctas: [],
      },
      subscription: {
        __typename: "GameCTA",
        type: "ADD_TO_CART",
        action: {
          type: "ADD_TO_CART",
          param: [
            { name: "skuId", value: sku },
            { name: "rewardId", value: "OUTRIGHT" },
          ],
        },
        price: {
          basePriceValue: 2000,
          discountedValue: 0,
          currencyCode: country === "BR" ? "BRL" : "USD",
          applicability: "APPLICABLE",
          isExclusive: false,
          isTiedToSubscription: true,
          serviceBranding: ["PS_PLUS"],
        },
      },
      purchase: {
        __typename: "GameCTA",
        type: "ADD_TO_CART",
        action: {
          type: "ADD_TO_CART",
          param: [
            { name: "skuId", value: sku },
            { name: "rewardId", value: "OUTRIGHT" },
          ],
        },
        price: {
          basePriceValue: 2000,
          discountedValue: 1000,
          currencyCode: country === "BR" ? "BRL" : "USD",
          applicability: "APPLICABLE",
          isExclusive: false,
          isTiedToSubscription: false,
          serviceBranding: ["NONE"],
          endTime: String(Date.now() + 86400000),
        },
      },
    },
  };
}
export function playstationHtml(fixture = playstationFixture()) {
  return (
    '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({ props: fixture.props }) +
    "</script>" +
    '<script type="application/json">' +
    JSON.stringify({ cache: fixture.cache }) +
    "</script>"
  );
}
