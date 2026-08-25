import { NextApiRequest } from "next";
import currency from "models/currency";
import { BASE_CURRENCY } from "models/pricing";
import { COUNTRY_HEADER, countryCodeFromHeader } from "lib/country";

export { COUNTRY_HEADER };

// ISO 3166-1 alpha-2 → ISO 4217. Deliberately a static map rather than a
// table: it is a property of the world, not of our catalogue, so putting it in
// the database would add an admin surface that can only ever be edited to be
// wrong. A country that is absent falls back to the base currency, which is
// also what happens when its currency exists but is disabled.
const COUNTRY_CURRENCY: Record<string, string> = {
  // Launch markets
  US: "USD",
  BR: "BRL",

  // Rest of the Americas
  AR: "ARS",
  CA: "CAD",
  CL: "CLP",
  CO: "COP",
  MX: "MXN",
  PE: "PEN",
  UY: "UYU",

  // Eurozone
  AT: "EUR",
  BE: "EUR",
  DE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  IE: "EUR",
  IT: "EUR",
  NL: "EUR",
  PT: "EUR",

  // Rest of Europe
  CH: "CHF",
  CZ: "CZK",
  DK: "DKK",
  GB: "GBP",
  NO: "NOK",
  PL: "PLN",
  SE: "SEK",
  TR: "TRY",

  // Asia-Pacific
  AU: "AUD",
  CN: "CNY",
  ID: "IDR",
  IN: "INR",
  JP: "JPY",
  KR: "KRW",
  MY: "MYR",
  NZ: "NZD",
  PH: "PHP",
  SG: "SGD",
  TH: "THB",
  TW: "TWD",
  VN: "VND",

  // Middle East and Africa
  AE: "AED",
  EG: "EGP",
  IL: "ILS",
  NG: "NGN",
  SA: "SAR",
  ZA: "ZAR",
};

function countryFromRequest(req: NextApiRequest): string | null {
  return countryCodeFromHeader(req.headers[COUNTRY_HEADER]);
}

export function currencyCodeForCountry(country: string | null): string {
  if (!country) {
    return BASE_CURRENCY;
  }

  return COUNTRY_CURRENCY[country] ?? BASE_CURRENCY;
}

// The currency a visitor should see prices in. Falls back to the base currency
// whenever the region is unknown, unmapped, or maps to a currency we do not
// currently sell in — never leaves the caller without a currency.
async function currencyForRequest(req: NextApiRequest): Promise<string> {
  const candidate = currencyCodeForCountry(countryFromRequest(req));

  if (candidate === BASE_CURRENCY) {
    return BASE_CURRENCY;
  }

  const isUsable = await currency
    .findOneByCode(candidate)
    .then((found) => found.enabled)
    .catch(() => false);

  return isUsable ? candidate : BASE_CURRENCY;
}

const region = {
  COUNTRY_HEADER,
  countryFromRequest,
  currencyCodeForCountry,
  currencyForRequest,
};

export default region;
