import { fetchProduct, parseNintendoProduct } from "infra/nintendo";
import { parseNintendoUrl, nintendoProductUrl } from "lib/nintendo";
import {
  NotFoundError,
  ServiceError,
  UnsupportedContentError,
} from "infra/errors";
import { nintendoHtml } from "tests/fixtures/nintendo";

const url = nintendoProductUrl("test-knight-switch", "BR");
afterEach(() => jest.restoreAllMocks());

test.each([
  "http://www.nintendo.com/pt-br/store/products/test/",
  "https://www.nintendo.com.evil.test/us/store/products/test/",
  "https://www.nintendo.com@evil.test/us/store/products/test/",
  "https://www.nintendo.com:444/us/store/products/test/",
  "https://www.nintendo.com/us/store/games/",
  "https://localhost/us/store/products/test/",
  "https://www.nintendo.com/us/store/products/%2e%2e/",
])("rejects unsafe or unsupported URL %s", (input) =>
  expect(parseNintendoUrl(input)).toBeNull(),
);

test("canonicalizes regional links without tracking parameters", () => {
  expect(parseNintendoUrl(`${url}?campaign=foo#buy`)).toEqual({
    url,
    slug: "test-knight-switch",
    country: "BR",
  });
});

test.each(["BR", "US"] as const)(
  "extracts the selected full game in %s, not the first cached product",
  (country) => {
    const game = parseNintendoProduct(
      nintendoHtml(country),
      nintendoProductUrl("test-knight-switch", country),
    );
    expect(game.nsuid).toBe("70010000003208");
    expect(game.prices?.currency).toBe(country === "BR" ? "BRL" : "USD");
    expect(game.supportedLanguages).toContain("Brazilian Portuguese");
  },
);

test("distinguishes a Switch 2 edition", () => {
  const game = parseNintendoProduct(
    nintendoHtml("BR", {
      nsuid: "70010000117998",
      platform: { code: "NINTENDO_SWITCH_2", label: "Nintendo Switch 2" },
    }),
    url,
  );
  expect(game.platform.code).toBe("NINTENDO_SWITCH_2");
});

test.each([
  { isUpgrade: true },
  { nsuid: "70050000069063" },
  { dlcType: "DLC" },
  { topLevelCategory: { code: "HARDWARE" } },
])("rejects non-game product %p", (override) => {
  expect(() => parseNintendoProduct(nintendoHtml("BR", override), url)).toThrow(
    UnsupportedContentError,
  );
});

test.each([
  "<html>Changed page</html>",
  '<script id="__NEXT_DATA__">{"props":{}}</script>',
])("rejects changed page structure", (html) =>
  expect(() => parseNintendoProduct(html, url)).toThrow(ServiceError),
);

test("a missing or foreign currency price is unknown, never free", () => {
  expect(
    parseNintendoProduct(
      nintendoHtml("BR", { 'prices({"personalized":false})': null }),
      url,
    ).prices,
  ).toBeNull();
  expect(() =>
    parseNintendoProduct(
      nintendoHtml("US"),
      nintendoProductUrl("test-knight-switch", "BR"),
    ),
  ).toThrow(ServiceError);
});

test("fetch validates redirects before making a second request", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/internal" },
    }),
  );
  await expect(fetchProduct("test-knight-switch", "BR")).rejects.toThrow(
    ServiceError,
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("fetches without cookies and with a bounded request", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(nintendoHtml()));
  expect((await fetchProduct("test-knight-switch", "BR")).country).toBe("BR");
  expect(fetchMock).toHaveBeenCalledWith(url, {
    redirect: "manual",
    signal: expect.any(AbortSignal),
  });
});

test("404 and transport failure remain distinguishable", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(null, { status: 404 }));
  await expect(fetchProduct("test-knight-switch", "BR")).rejects.toThrow(
    NotFoundError,
  );
  fetchMock.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  await expect(fetchProduct("test-knight-switch", "BR")).rejects.toThrow(
    ServiceError,
  );
});
