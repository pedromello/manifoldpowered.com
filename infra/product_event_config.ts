export function productEventSecret(): string | null {
  const secret = process.env.PRODUCT_EVENTS_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}
export function serverEventsEnabled() {
  return process.env.PRODUCT_EVENTS_SERVER_ENABLED === "true";
}
export function clientEventsEnabled() {
  return (
    process.env.PRODUCT_EVENTS_CLIENT_ENABLED === "true" &&
    !!productEventSecret()
  );
}
export function eventLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 1_000_000)
    : fallback;
}
