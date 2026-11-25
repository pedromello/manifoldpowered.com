import { ServiceError } from "infra/errors";

export function sandboxEnabled() {
  if ((process.env.PAYMENT_ENVIRONMENT || "sandbox") !== "sandbox")
    return false;
  if (["development", "test"].includes(process.env.NODE_ENV)) return true;
  return (
    process.env.APP_ENV === "hml" && process.env.PURCHASES_ENABLED === "true"
  );
}

export function giftCardsEnabled() {
  return (
    sandboxEnabled() &&
    (["development", "test"].includes(process.env.NODE_ENV) ||
      process.env.GIFT_CARD_PROVIDER === "api")
  );
}

export function assertSandbox() {
  if (!sandboxEnabled())
    throw new ServiceError({ message: "Purchases are unavailable." });
}

export function manualTrackingEnabled() {
  return (
    sandboxEnabled() &&
    (["development", "test"].includes(process.env.NODE_ENV) ||
      process.env.APP_ENV === "hml")
  );
}
