import { ServiceError } from "infra/errors";
import { appmaxPaymentProvider } from "./appmax";
import { stripePaymentProvider } from "./stripe";
import { assertPaymentSandbox, selectedPaymentProvider } from "./config";
import type { PaymentProviderName } from "./types";

export function paymentProvider(name: PaymentProviderName) {
  if (name === "appmax") return appmaxPaymentProvider;
  if (name === "stripe") return stripePaymentProvider;
  throw new ServiceError({ message: "Purchases are unavailable." });
}
export function paymentsConfigured() {
  try {
    assertPaymentSandbox();
    return paymentProvider(selectedPaymentProvider()).configured();
  } catch {
    return false;
  }
}
export { assertPaymentSandbox, selectedPaymentProvider };
