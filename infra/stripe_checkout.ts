import Stripe from "stripe";
import { ServiceError, ValidationError } from "infra/errors";
import {
  assertGiftCardSandbox,
  type GiftCardProduct,
} from "infra/gift_card_provider";

export interface CheckoutRequest {
  order_id: string;
  product: GiftCardProduct;
}

export interface CheckoutGateway {
  create(input: CheckoutRequest): Promise<Stripe.Checkout.Session>;
  retrieve(sessionId: string): Promise<Stripe.Checkout.Session>;
  expire(sessionId: string): Promise<Stripe.Checkout.Session>;
}

export function stripeCheckoutConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),
  );
}

function client() {
  assertGiftCardSandbox();
  if (!stripeCheckoutConfigured()) {
    throw new ServiceError({
      message: "Stripe test checkout is not configured.",
    });
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    timeout: 10000,
    maxNetworkRetries: 1,
  });
}

function checkoutOrigin() {
  const value = process.env.STRIPE_CHECKOUT_ORIGIN || "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError({
      message: "Invalid checkout origin configuration.",
    });
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  ) {
    throw new ServiceError({
      message: "Invalid checkout origin configuration.",
    });
  }
  return url.origin;
}

// Never propagate SDK error bodies, request headers, URLs or credentials to
// the application's error logger. Stripe errors are deliberately sanitized.
async function stripeOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new ServiceError({
      message: "Stripe test checkout is temporarily unavailable.",
    });
  }
}

export const stripeCheckoutGateway: CheckoutGateway = {
  async create({ order_id, product }) {
    const stripe = client();
    const origin = checkoutOrigin();
    const metadata = { purchase_type: "gift_card", order_id };
    return stripeOperation(() =>
      stripe.checkout.sessions.create(
        {
          mode: "payment",
          adaptive_pricing: { enabled: false },
          allowed_payment_method_types: ["card"],
          client_reference_id: order_id,
          metadata,
          payment_intent_data: { metadata },
          line_items: [
            {
              price_data: {
                currency: product.currency.toLowerCase(),
                unit_amount: product.amount_minor,
                product_data: { name: product.name },
              },
              quantity: 1,
            },
          ],
          success_url: `${origin}/library/gift-cards?order=${order_id}&checkout=returned`,
          cancel_url: `${origin}/library/gift-cards?order=${order_id}&checkout=cancelled`,
        },
        { idempotencyKey: `gift-card-checkout:${order_id}` },
      ),
    );
  },
  async retrieve(sessionId) {
    const stripe = client();
    return stripeOperation(() => stripe.checkout.sessions.retrieve(sessionId));
  },
  async expire(sessionId) {
    const stripe = client();
    return stripeOperation(() => stripe.checkout.sessions.expire(sessionId));
  },
};

export function verifyStripeEvent(
  body: Buffer,
  signature: string,
): Stripe.Event {
  const stripe = client();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    throw new ValidationError({ message: "Invalid Stripe webhook signature." });
  }
  if (event.livemode)
    throw new ValidationError({ message: "Live payments are not accepted." });
  return event;
}
