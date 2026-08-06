// Formatting for prices coming out of the storefront API.
//
// `display_price` is what the visitor should see, already resolved to their
// currency by the server. `price`/`base_price` remain the USD base, so these
// helpers fall back to them for any surface not yet passing through the
// regional pricing path.

export interface DisplayPrice {
  amount: string;
  base_amount: string | null;
  currency: string;
  symbol: string;
}

export interface PricedItem {
  price: string;
  base_price?: string | null;
  display_price?: DisplayPrice | null;
}

const BASE_SYMBOL = "$";

// Currencies whose convention is a comma decimal separator and a period
// thousands separator (e.g. R$34.887,99), the mirror of the US/UK style the
// raw amount string already uses. The amount always arrives as a plain
// period-decimal, ungrouped digit string from the server (see
// docs/payments-architecture.md and models/pricing.ts's `toFixed`), so this
// only reformats the separators via string splitting — it never re-parses
// through Number, which would risk losing precision on ledger-scale amounts.
const COMMA_DECIMAL_CURRENCIES = new Set([
  "BRL",
  "EUR",
  "ARS",
  "CLP",
  "COP",
  "UYU",
  "CZK",
  "DKK",
  "NOK",
  "PLN",
  "SEK",
  "TRY",
  "IDR",
  "VND",
]);

function localizeAmount(amount: string, currency: string): string {
  if (!COMMA_DECIMAL_CURRENCIES.has((currency || "").toUpperCase())) {
    return amount;
  }

  const sign = amount.startsWith("-") ? "-" : "";
  const [integerPart, decimalPart] = amount.replace("-", "").split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return decimalPart !== undefined
    ? `${sign}${grouped},${decimalPart}`
    : `${sign}${grouped}`;
}

export function isFree(item: PricedItem): boolean {
  const amount = item.display_price?.amount ?? item.price;
  return !amount || Number(amount) === 0;
}

export function formatPrice(item: PricedItem): string {
  if (item.display_price) {
    const { symbol, amount, currency } = item.display_price;
    return `${symbol}${localizeAmount(amount, currency)}`;
  }

  return `${BASE_SYMBOL}${item.price}`;
}

// The struck-through "was" price, or null when there is no discount to show.
export function formatBasePrice(item: PricedItem): string | null {
  if (item.display_price) {
    const { base_amount, amount, symbol, currency } = item.display_price;

    if (!base_amount || base_amount === amount) {
      return null;
    }

    return `${symbol}${localizeAmount(base_amount, currency)}`;
  }

  if (!item.base_price || item.base_price === item.price) {
    return null;
  }

  return `${BASE_SYMBOL}${item.base_price}`;
}

export function hasDiscount(item: PricedItem): boolean {
  return !isFree(item) && formatBasePrice(item) !== null;
}

// Money that is not a product price: a sale's `price_at_sale`, a statement
// balance, a revenue total.
//
// Every helper above takes a `PricedItem` — an object carrying `price` and
// optionally `display_price` — so none of them can be handed an
// `{ amount, currency }` pair. These surfaces have no product to pass.
//
// The digits are used exactly as the server sent them. That is the whole point:
// sales serialise at 2 decimal places and statement balances at 4, because the
// ledger holds fractions of a cent that an affiliate reconciles against a real
// payment. Re-rounding here is precisely how that precision would be lost, so
// this function only ever puts a symbol in front of a string it does not touch.
export function formatMoney(amount: string | number, currency: string): string {
  return `${currencySymbol(currency)}${localizeAmount(String(amount), currency)}`;
}

// Symbol lookup memoised per currency code. Intl knows the symbol for every
// registered code, which saves shipping a table that would drift from the
// Currency rows in the database.
const symbolCache = new Map<string, string>();

export function currencySymbol(currency: string): string {
  const code = (currency || "").toUpperCase();

  if (!code) {
    return BASE_SYMBOL;
  }

  const cached = symbolCache.get(code);
  if (cached !== undefined) {
    return cached;
  }

  // Intl throws RangeError on a code it does not recognise rather than
  // returning anything, and the ledger will happily record a currency Intl has
  // never heard of. Falling back to the code itself keeps the amount labelled
  // instead of unlabelled, which matters more here than looking tidy.
  let symbol = `${code} `;
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).formatToParts(0);

    const currencyPart = parts.find((part) => part.type === "currency");
    if (currencyPart) {
      symbol = currencyPart.value;
    }
  } catch {
    // Keep the code-as-symbol fallback.
  }

  symbolCache.set(code, symbol);
  return symbol;
}
