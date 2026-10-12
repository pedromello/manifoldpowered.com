import { ServiceError } from "infra/errors";
import type { PaymentProviderName } from "./types";

export function assertPaymentSandbox() {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    (process.env.PAYMENT_ENVIRONMENT || "sandbox") !== "sandbox"
  )
    throw new ServiceError({ message: "Purchases are unavailable." });
}
export function selectedPaymentProvider(): PaymentProviderName {
  const provider = process.env.PAYMENT_PROVIDER || "appmax";
  if (provider !== "appmax" && provider !== "stripe")
    throw new ServiceError({ message: "Purchases are unavailable." });
  return provider;
}
export function appmaxEndpoints() {
  assertPaymentSandbox();
  const auth = (
    process.env.APPMAX_AUTH_URL ||
    "https://auth.sandboxappmax.com.br/oauth2/token"
  ).replace(/\/$/, "");
  const api = (
    process.env.APPMAX_API_URL || "https://api.sandboxappmax.com.br"
  ).replace(/\/$/, "");
  if (
    auth !== "https://auth.sandboxappmax.com.br/oauth2/token" ||
    api !== "https://api.sandboxappmax.com.br"
  ) {
    throw new ServiceError({ message: "Purchases are unavailable." });
  }
  return { auth, api };
}
export function paymentOrigin() {
  const url = new URL(
    process.env.PAYMENT_ORIGIN ||
      process.env.STRIPE_CHECKOUT_ORIGIN ||
      "http://127.0.0.1:3000",
  );
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new ServiceError({ message: "Purchases are unavailable." });
  return url.origin;
}
