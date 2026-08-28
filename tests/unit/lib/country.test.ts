import { countryCodeFromHeader } from "lib/country";
import { headersForInternalFetch } from "lib/internal-fetch";
import { localeForCountry } from "lib/locale";

describe("country-based locale selection", () => {
  test.each(["BR", "br", " BR "])(
    "selects Brazilian Portuguese for %s",
    (country) => {
      expect(localeForCountry(country)).toBe("pt-BR");
    },
  );

  test.each([null, undefined, "", "XX", "US", "BRA"])(
    "falls back to English for %s",
    (country) => {
      expect(localeForCountry(country)).toBe("en");
    },
  );

  test("normalizes the same country header used by regional pricing", () => {
    expect(countryCodeFromHeader([" br ", "US"])).toBe("BR");
  });

  test("forwards session and normalized country to internal SSR requests", () => {
    expect(
      headersForInternalFetch({
        cookie: "session=abc",
        "x-vercel-ip-country": " br ",
      }),
    ).toEqual({
      cookie: "session=abc",
      "x-vercel-ip-country": "BR",
      "x-manifold-visitor-country": "BR",
    });
  });
});
