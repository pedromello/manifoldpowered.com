export const PRICE_PROVIDERS = ["STEAM", "NINTENDO", "PLAYSTATION"] as const;
export type PriceProvider = (typeof PRICE_PROVIDERS)[number];
export type PriceCountry = "BR" | "US";
export interface CollectedPrice {
  currency: string;
  amount: string;
  original_amount: string | null;
  discount_percent: number | null;
  expires_at: Date | null;
  url: string;
  captured_at: Date;
}
export const ACTIVE_PRICE_RUNS = [
  "QUEUED",
  "RUNNING",
  "DISPATCH_FAILED",
  "INTERRUPTED",
];
export const PRICE_LEASE_MS = 90_000;

/** Keep logs/reports bounded and free of HTTP bodies and credentials. */
export function priceErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN_ERROR";
  const context = (error as Error & { context?: unknown }).context;
  if (typeof context === "string" && /^[A-Z_0-9]+$/.test(context))
    return context;
  if (context && typeof context === "object" && "status" in context)
    return `HTTP_${Number(context.status) || 0}`;
  return error.name === "ServiceError" ? "NETWORK_ERROR" : error.name;
}

export function retryDelay(error: unknown, attempt: number, now = Date.now()) {
  const code = priceErrorCode(error);
  if (!/^(NETWORK_ERROR|TIMEOUT|HTTP_429|HTTP_5\d\d)$/.test(code)) return null;
  const hint = (error as { retryAfter?: string })?.retryAfter;
  const seconds = hint ? Number(hint) : NaN;
  const retryAt = hint && !Number.isFinite(seconds) ? Date.parse(hint) : NaN;
  return Math.max(
    1000 * 2 ** (attempt - 1),
    Number.isFinite(seconds)
      ? seconds * 1000
      : Number.isFinite(retryAt)
        ? retryAt - now
        : 0,
  );
}
