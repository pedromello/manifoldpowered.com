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
