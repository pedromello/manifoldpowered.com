/** Server-only delivery controls. No deployment sends until explicitly enabled. */
export function selectionEmailsEnabled() {
  return (
    process.env.OUTLET_SELECTION_EMAILS_ENABLED === "true" &&
    selectionEmailDailyLimit() > 0
  );
}

/** Production requires an explicit bulk allowance; reserve authentication capacity separately. */
export function selectionEmailDailyLimit() {
  const configured = Number(
    process.env.SELECTION_EMAIL_DAILY_LIMIT ??
      (process.env.NODE_ENV === "production" ? 0 : 10_000),
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, 1_000_000)
    : 0;
}

export function selectionEmailProductionOrigin() {
  const origin = new URL(
    process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN ||
      "https://www.manifoldpowered.com",
  );
  const local = ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(
        local &&
        process.env.NODE_ENV !== "production" &&
        origin.protocol === "http:"
      ))
  )
    throw new Error("Invalid selection email origin");
  return origin.origin;
}
