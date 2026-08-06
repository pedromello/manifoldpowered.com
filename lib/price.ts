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

export function isFree(item: PricedItem): boolean {
  const amount = item.display_price?.amount ?? item.price;
  return !amount || Number(amount) === 0;
}

export function formatPrice(item: PricedItem): string {
  if (item.display_price) {
    return `${item.display_price.symbol}${item.display_price.amount}`;
  }

  return `${BASE_SYMBOL}${item.price}`;
}

// The struck-through "was" price, or null when there is no discount to show.
export function formatBasePrice(item: PricedItem): string | null {
  if (item.display_price) {
    const { base_amount, amount, symbol } = item.display_price;

    if (!base_amount || base_amount === amount) {
      return null;
    }

    return `${symbol}${base_amount}`;
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
  return `${currencySymbol(currency)}${amount}`;
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
