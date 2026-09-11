import type { NextApiRequest } from "next";
import region from "models/region";

jest.mock("models/currency", () => ({
  __esModule: true,
  default: { findOneByCode: jest.fn() },
}));
jest.mock("models/pricing", () => ({ BASE_CURRENCY: "USD" }));

function request(headers: NextApiRequest["headers"] = {}) {
  return { headers, query: { locale: "pt-BR" } } as NextApiRequest;
}

function setEnvironment(
  nodeEnv: "development" | "test" | "production",
  country?: string,
) {
  const nextEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: nodeEnv };
  delete nextEnv.MANIFOLD_DEV_COUNTRY;
  if (country !== undefined) nextEnv.MANIFOLD_DEV_COUNTRY = country;
  jest.replaceProperty(process, "env", nextEnv);
}

afterEach(() => jest.restoreAllMocks());

describe("external offer visitor country", () => {
  test("uses an explicitly configured development country without geolocation", () => {
    setEnvironment("development", " br ");

    const country = region.externalOfferCountryFromRequest(request());

    expect(country).toBe("BR");
    expect(region.currencyCodeForCountry(country)).toBe("BRL");
  });

  test("prefers the visitor geolocation over the development fallback and locale", () => {
    setEnvironment("development", "BR");

    const country = region.externalOfferCountryFromRequest(
      request({ "x-vercel-ip-country": "US" }),
    );

    expect(country).toBe("US");
    expect(region.currencyCodeForCountry(country)).toBe("USD");
  });

  test("preserves the original SSR visitor country over the server geolocation", () => {
    setEnvironment("development", "US");

    expect(
      region.externalOfferCountryFromRequest(
        request({
          "x-manifold-visitor-country": "BR",
          "x-vercel-ip-country": "US",
        }),
      ),
    ).toBe("BR");
  });

  test("keeps USD as the default when the visitor country is unknown", () => {
    setEnvironment("development");

    const country = region.externalOfferCountryFromRequest(request());

    expect(country).toBeNull();
    expect(region.currencyCodeForCountry(country)).toBe("USD");
  });

  test.each(["", "XX", "BRA", "12"])(
    "ignores the invalid development country %j",
    (configuredCountry) => {
      setEnvironment("development", configuredCountry);

      const country = region.externalOfferCountryFromRequest(request());

      expect(country).toBeNull();
      expect(region.currencyCodeForCountry(country)).toBe("USD");
    },
  );

  test.each(["test", "production"] as const)(
    "ignores the development fallback in %s",
    (nodeEnv) => {
      setEnvironment(nodeEnv, "BR");

      expect(region.externalOfferCountryFromRequest(request())).toBeNull();
    },
  );

  test("does not apply the development fallback to Manifold checkout pricing", async () => {
    setEnvironment("development", "BR");
    const req = request();

    expect(region.externalOfferCountryFromRequest(req)).toBe("BR");
    expect(region.countryFromRequest(req)).toBeNull();
    await expect(region.currencyForRequest(req)).resolves.toBe("USD");
  });
});
