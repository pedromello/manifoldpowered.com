import {
  stripeCheckoutConfigured,
  stripeCheckoutGateway,
  verifyStripeEvent,
} from "infra/stripe_checkout";
import { ValidationError } from "infra/errors";
import { assertPaymentSandbox } from "./config";
import type { PaymentContext, PaymentProvider, PaymentSnapshot } from "./types";

export const stripePaymentProvider: PaymentProvider = {
  name: "stripe",
  configured: stripeCheckoutConfigured,
  capabilities: { methods: ["card"], installments: false, hosted: true },
  async quote(amount, installments) {
    if (installments !== 1)
      throw new ValidationError({
        message: "This installment option is unavailable.",
      });
    return { installments: 1, total_minor: amount, interest_minor: 0 };
  },
  async quotes(amount) {
    return [{ installments: 1, total_minor: amount, interest_minor: 0 }];
  },
  async createCustomer() {
    return undefined;
  },
  async createOrder() {
    return "";
  },
  async pay(input) {
    assertPaymentSandbox();
    // Reuse the sandbox transport; SDK shapes stop at this adapter.
    const session = await stripeCheckoutGateway.create({
      order_id: input.order_id,
      product: {
        code: input.product_code,
        name: input.product_name,
        amount_minor: input.amount_minor,
        currency: input.currency,
      },
      return_path: `/checkout/${encodeURIComponent(input.order_id)}`,
      request_key: `purchase-payment:${input.attempt_id}`,
      purchase_type: "purchase",
    });
    return snapshot(session, input);
  },
  async retrieve(input) {
    return snapshot(
      await stripeCheckoutGateway.retrieve(input.remote_order_id!),
      input,
    );
  },
  async cancel(input) {
    const current = await stripePaymentProvider.retrieve(input);
    if (current.state !== "PENDING" || !current.checkout_url) return current;
    try {
      return snapshot(
        await stripeCheckoutGateway.expire(input.remote_order_id!),
        input,
      );
    } catch {
      const checked = await stripePaymentProvider.retrieve(input);
      if (checked.state === "PAID" || checked.state === "CANCELLED")
        return checked;
      throw new ValidationError({
        message:
          "This payment cannot be cancelled here. Check your order status.",
      });
    }
  },
};
function snapshot(
  session: Awaited<ReturnType<typeof stripeCheckoutGateway.retrieve>>,
  input: PaymentContext,
): PaymentSnapshot {
  if (
    session.livemode ||
    session.mode !== "payment" ||
    session.client_reference_id !== input.order_id ||
    session.metadata?.order_id !== input.order_id ||
    session.amount_total !== input.amount_minor ||
    session.currency !== input.currency.toLowerCase() ||
    (input.remote_order_id && input.remote_order_id !== session.id)
  )
    throw new ValidationError({
      message: "Payment does not match this order.",
    });
  if (
    session.url &&
    new URL(session.url).origin !== "https://checkout.stripe.com"
  )
    throw new ValidationError({
      message: "Payment does not match this order.",
    });
  const intent =
    typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge =
    intent && typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : null;
  return {
    remote_order_id: session.id,
    remote_payment_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id,
    state: charge?.disputed
      ? "DISPUTED"
      : charge && charge.amount_refunded > 0
        ? "REFUNDED"
        : session.status === "complete" && session.payment_status === "paid"
          ? "PAID"
          : session.status === "expired"
            ? "CANCELLED"
            : "PENDING",
    total_minor: session.amount_total!,
    currency: session.currency!.toUpperCase(),
    method: "card",
    installments: 1,
    checkout_url:
      session.status === "open" ? (session.url ?? undefined) : undefined,
    expires_at: new Date(session.expires_at * 1000),
  };
}
export function stripePaymentSignal(
  event: ReturnType<typeof verifyStripeEvent>,
) {
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
      "charge.dispute.created",
      "charge.dispute.updated",
      "charge.dispute.closed",
    ].includes(event.type)
  )
    return null;
  const object = event.data.object as {
    id?: string;
    payment_intent?: string | { id: string };
    metadata?: { order_id?: string };
  };
  return {
    remote_order_id: event.type.startsWith("checkout.session.")
      ? object.id
      : undefined,
    remote_payment_id:
      typeof object.payment_intent === "string"
        ? object.payment_intent
        : object.payment_intent?.id,
    order_id: object.metadata?.order_id,
  };
}
