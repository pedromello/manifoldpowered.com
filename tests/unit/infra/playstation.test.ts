import { fetchProduct, parsePlayStationProduct } from "infra/playstation";
import { parsePlayStationUrl, playStationProductUrl } from "lib/playstation";
import {
  PLAYSTATION_ID,
  OTHER_PLAYSTATION_ID,
  playstationFixture,
  playstationHtml,
} from "tests/fixtures/playstation";
const url = playStationProductUrl(PLAYSTATION_ID, "BR");
afterEach(() => jest.restoreAllMocks());
test.each(["BR", "US"] as const)(
  "reads the exact edition and public %s offer without mistaking PS Plus inclusion for free",
  (country) => {
    const value = parsePlayStationProduct(
      playstationHtml(playstationFixture(country)),
      playStationProductUrl(PLAYSTATION_ID, country),
    );
    expect(value).toMatchObject({
      id: PLAYSTATION_ID,
      name: "Orbit Tactics",
      platforms: ["PS5"],
      prices: {
        amount: "10.00",
        original_amount: "20.00",
        discount_percent: 50,
      },
    });
  },
);
test.each([
  "http://store.playstation.com/pt-br/product/" + PLAYSTATION_ID,
  "https://store.playstation.com.evil.test/pt-br/product/" + PLAYSTATION_ID,
  "https://user:password@store.playstation.com/pt-br/product/" + PLAYSTATION_ID,
  "https://store.playstation.com:1234/pt-br/product/" + PLAYSTATION_ID,
  "https://store.playstation.com/en-gb/product/" + PLAYSTATION_ID,
  "https://store.playstation.com/pt-br/concept/123",
  "https://store.playstation.com/pt-br/product/%2e%2e",
])("rejects unsupported or unsafe references: %s", (value) =>
  expect(parsePlayStationUrl(value)).toBeNull(),
);
test("canonicalizes a product link without retaining tracking", () =>
  expect(parsePlayStationUrl(url + "?tracking=ignored#fragment")?.url).toBe(
    url,
  ));
test("never substitutes the other edition when the requested product is absent", () => {
  const fixture = playstationFixture();
  delete fixture.cache["Product:" + PLAYSTATION_ID];
  expect(() => parsePlayStationProduct(playstationHtml(fixture), url)).toThrow(
    "PlayStation product data could not be read",
  );
});
test("rejects a different response identity even when another valid product exists", () => {
  const fixture = playstationFixture();
  fixture.props.pageProps.productId = OTHER_PLAYSTATION_ID;
  expect(() =>
    parsePlayStationProduct(playstationHtml(fixture), url),
  ).toThrow();
});
test.each(["ADD_ON", "DEMO", "SUBSCRIPTION"])(
  "rejects %s instead of importing an upsell",
  (classification) => {
    const fixture = playstationFixture();
    fixture.cache["Product:" + PLAYSTATION_ID].storeDisplayClassification =
      classification;
    expect(() =>
      parsePlayStationProduct(playstationHtml(fixture), url),
    ).toThrow("Only complete PS4 and PS5");
  },
);
test("missing or subscriber-only prices remain unknown", () => {
  const fixture = playstationFixture();
  delete fixture.cache.purchase;
  expect(
    parsePlayStationProduct(playstationHtml(fixture), url).prices,
  ).toBeNull();
});
test("preserves genuine public free-to-play prices", () => {
  const fixture = playstationFixture();
  Object.assign(fixture.cache.purchase.price, {
    basePriceValue: 0,
    discountedValue: 0,
    endTime: null,
  });
  expect(
    parsePlayStationProduct(playstationHtml(fixture), url).prices,
  ).toMatchObject({
    amount: "0.00",
    original_amount: "0.00",
    discount_percent: null,
  });
});
test.each([
  { currencyCode: "USD" },
  { isExclusive: true },
  { discountedValue: -1 },
  { endTime: "invalid" },
  { endTime: String(Date.now() - 1000) },
])("does not advertise an incoherent or expired offer %j", (override) => {
  const fixture = playstationFixture();
  Object.assign(fixture.cache.purchase.price, override);
  expect(
    parsePlayStationProduct(playstationHtml(fixture), url).prices,
  ).toBeNull();
});
test("does not follow a redirect to a different host or edition", async () => {
  const mock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "https://example.test/private" },
    }),
  );
  await expect(fetchProduct(PLAYSTATION_ID, "BR")).rejects.toThrow();
  expect(mock).toHaveBeenCalledTimes(1);
  expect(mock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  expect(mock.mock.calls[0][1]?.headers).not.toHaveProperty("cookie");
});

test("rejects a physical-only product", () => {
  const fixture = playstationFixture();
  Object.assign(fixture.cache["Product:" + PLAYSTATION_ID], {
    isPhysicalProduct: true,
  });
  expect(() => parsePlayStationProduct(playstationHtml(fixture), url)).toThrow(
    "Only complete PS4 and PS5",
  );
});
