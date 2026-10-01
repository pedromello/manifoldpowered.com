import type Stripe from "stripe";
import { prisma } from "infra/database";
import { type GiftCardOrder, type Prisma } from "generated/prisma/client";
import {
  ConflictError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "infra/errors";
import {
  assertGiftCardSandbox,
  simulatedGiftCardProvider,
  type GiftCardProvider,
  type GiftCardProduct,
} from "infra/gift_card_provider";
import {
  stripeCheckoutGateway,
  type CheckoutGateway,
} from "infra/stripe_checkout";

const activeStatuses = [
  "CHECKOUT_PENDING",
  "AWAITING_PAYMENT",
  "PAID",
  "ISSUANCE_FAILED",
] as const;
const checkoutStatuses = ["CHECKOUT_PENDING", "AWAITING_PAYMENT"] as const;
// Stripe may remove idempotency records after 24 hours. Never recreate an
// uncertain checkout beyond this window: it needs reconciliation instead.
const CHECKOUT_RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000;
const transactionOptions = { maxWait: 30000, timeout: 30000 };

export function createGiftCardOrderService({
  gateway = stripeCheckoutGateway,
  provider = simulatedGiftCardProvider,
}: { gateway?: CheckoutGateway; provider?: GiftCardProvider } = {}) {
  async function productFor(code: string) {
    const product = (await provider.products()).find(
      (item) => item.code === code,
    );
    if (
      !product ||
      !Number.isSafeInteger(product.amount_minor) ||
      product.amount_minor <= 0 ||
      !/^[A-Z]{3}$/.test(product.currency)
    ) {
      throw new ValidationError({
        message: "Gift card product is unavailable.",
      });
    }
    return product;
  }

  async function lock(
    tx: Prisma.TransactionClient,
    id: string,
    userId?: string,
  ) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM gift_card_orders WHERE id = ${id} AND (${userId ?? null}::text IS NULL OR user_id = ${userId ?? null}) FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundError({ message: "Gift card order not found." });
    return tx.giftCardOrder.findUniqueOrThrow({ where: { id } });
  }

  function productSnapshot(order: GiftCardOrder): GiftCardProduct {
    return {
      code: order.product_code,
      name: order.product_name,
      amount_minor: order.amount_minor,
      currency: order.currency,
    };
  }

  function validateSession(
    order: GiftCardOrder,
    session: Stripe.Checkout.Session,
  ) {
    if (
      session.livemode ||
      session.mode !== "payment" ||
      session.client_reference_id !== order.id ||
      session.metadata?.purchase_type !== "gift_card" ||
      session.metadata?.order_id !== order.id ||
      session.amount_total !== order.amount_minor ||
      session.currency !== order.currency.toLowerCase() ||
      (order.stripe_session_id && session.id !== order.stripe_session_id)
    ) {
      throw new ValidationError({
        message: "Checkout does not match the gift card order.",
      });
    }
  }

  async function begin(userId: string, code: string, idempotencyKey: string) {
    assertGiftCardSandbox();
    const product = await productFor(code);
    const order = await prisma.$transaction(async (tx) => {
      // Lock the logical buyer/product before checking for an active order.
      // The partial unique DB index also protects callers outside this model.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${userId}:${code}`}, 0))`;
      const existing = await tx.giftCardOrder.findUnique({
        where: {
          user_id_idempotency_key: {
            user_id: userId,
            idempotency_key: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.product_code !== code)
          throw new ConflictError({
            message:
              "This purchase request already belongs to another product.",
          });
        return existing;
      }
      const active = await tx.giftCardOrder.findFirst({
        where: {
          user_id: userId,
          product_code: code,
          status: { in: [...activeStatuses] },
        },
      });
      if (active)
        throw new ConflictError({
          message: "There is already an active purchase for this product.",
          context: { order_id: active.id },
        });
      return tx.giftCardOrder.create({
        data: {
          user_id: userId,
          idempotency_key: idempotencyKey,
          product_code: product.code,
          product_name: product.name,
          amount_minor: product.amount_minor,
          currency: product.currency,
        },
      });
    }, transactionOptions);
    return checkout(userId, order.id);
  }

  async function checkout(userId: string, id: string) {
    assertGiftCardSandbox();
    return prisma.$transaction(async (tx) => {
      const order = await lock(tx, id, userId);
      if (!(checkoutStatuses as readonly string[]).includes(order.status))
        return order;
      if (
        !order.stripe_session_id &&
        Date.now() - order.checkout_started_at.getTime() >
          CHECKOUT_RECOVERY_WINDOW_MS
      ) {
        throw new ConflictError({
          message:
            "This checkout needs reconciliation before another payment attempt.",
          action:
            "Contact support with the order ID. Do not start a second payment.",
        });
      }
      const session = order.stripe_session_id
        ? await gateway.retrieve(order.stripe_session_id)
        : await gateway.create({
            order_id: order.id,
            product: productSnapshot(order),
          });
      validateSession(order, session);
      if (
        session.status === "open" &&
        (!session.url ||
          new URL(session.url).origin !== "https://checkout.stripe.com")
      ) {
        throw new ServiceError({
          message: "Stripe did not return a valid checkout URL.",
        });
      }
      return tx.giftCardOrder.update({
        where: { id },
        data: {
          stripe_session_id: session.id,
          checkout_url: session.status === "open" ? session.url : null,
          checkout_expires_at: new Date(session.expires_at * 1000),
          status:
            session.status === "expired" && session.payment_status !== "paid"
              ? "CANCELLED"
              : "AWAITING_PAYMENT",
          last_error: null,
        },
      });
    }, transactionOptions);
  }

  async function cancel(userId: string, id: string) {
    assertGiftCardSandbox();
    // An uncertain create is recovered with the SAME Stripe key before
    // cancellation. A browser return never marks an open session cancelled.
    await checkout(userId, id);
    return prisma.$transaction(async (tx) => {
      const order = await lock(tx, id, userId);
      if (order.status !== "AWAITING_PAYMENT") return order;
      let session = await gateway.retrieve(order.stripe_session_id!);
      validateSession(order, session);
      if (session.status === "open") {
        session = await gateway.expire(session.id);
        validateSession(order, session);
      }
      if (session.status !== "expired" || session.payment_status === "paid")
        return order;
      return tx.giftCardOrder.update({
        where: { id },
        data: { status: "CANCELLED", checkout_url: null, last_error: null },
      });
    }, transactionOptions);
  }

  async function issue(tx: Prisma.TransactionClient, order: GiftCardOrder) {
    if (order.status === "FULFILLED") return order;
    if (!order.paid_at || !["PAID", "ISSUANCE_FAILED"].includes(order.status)) {
      throw new ConflictError({ message: "Payment has not been confirmed." });
    }
    let delivery;
    try {
      delivery = await provider.issue({
        request_id: order.id,
        product: productSnapshot(order),
      });
      if (!delivery.reference || !delivery.code)
        throw new Error("Incomplete delivery");
    } catch {
      // Commit the reliable payment and the failure state. No second charge
      // is needed; the stable request ID makes later issuance safe to retry.
      return tx.giftCardOrder.update({
        where: { id: order.id },
        data: {
          status: "ISSUANCE_FAILED",
          last_error: "ISSUANCE_FAILED",
          checkout_url: null,
        },
      });
    }
    await tx.libraryItem.upsert({
      where: {
        user_id_item_id_item_type: {
          user_id: order.user_id,
          item_id: order.id,
          item_type: "GIFT_CARD",
        },
      },
      create: {
        user_id: order.user_id,
        item_id: order.id,
        item_type: "GIFT_CARD",
      },
      update: {},
    });
    return tx.giftCardOrder.update({
      where: { id: order.id },
      data: {
        status: "FULFILLED",
        fulfilled_at: new Date(),
        provider_reference: delivery.reference,
        gift_card_code: delivery.code,
        last_error: null,
        checkout_url: null,
      },
    });
  }

  async function retryIssuance(userId: string, id: string) {
    assertGiftCardSandbox();
    return prisma.$transaction(
      async (tx) => issue(tx, await lock(tx, id, userId)),
      transactionOptions,
    );
  }

  async function receive(event: Stripe.Event) {
    assertGiftCardSandbox();
    if (event.livemode)
      throw new ValidationError({ message: "Live payments are not accepted." });
    const success = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type);
    const failure = event.type === "checkout.session.async_payment_failed";
    const expired = event.type === "checkout.session.expired";
    const declined = event.type === "payment_intent.payment_failed";
    if (!success && !failure && !expired && !declined) return;
    const object = event.data.object as
      | Stripe.Checkout.Session
      | Stripe.PaymentIntent;
    if (object.metadata?.purchase_type !== "gift_card") return;
    const id = object.metadata?.order_id;
    if (!id || !(await prisma.giftCardOrder.findUnique({ where: { id } })))
      return;

    const result = await prisma.$transaction(async (tx) => {
      let order = await lock(tx, id);
      const receipt = await tx.giftCardPaymentEvent.findUnique({
        where: { id: event.id },
      });
      if (
        receipt &&
        (receipt.order_id !== id || receipt.event_type !== event.type)
      )
        throw new ValidationError({
          message: "Webhook receipt does not match this order.",
        });
      if (order.status === "FULFILLED") return order;
      const sessionId = declined ? order.stripe_session_id : object.id;
      if (!sessionId)
        throw new ServiceError({
          message: "Checkout binding is not ready. Retry the webhook.",
        });
      // Fetch current Stripe state instead of trusting event ordering or the
      // success redirect. This also reconciles a lost checkout-create response.
      const session = await gateway.retrieve(sessionId);
      validateSession(order, session);
      if (declined) {
        const intentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (intentId !== object.id)
          throw new ValidationError({
            message: "Payment attempt does not match this checkout.",
          });
      }
      if (!receipt)
        await tx.giftCardPaymentEvent.create({
          data: { id: event.id, order_id: id, event_type: event.type },
        });
      if (
        success &&
        session.status === "complete" &&
        session.payment_status === "paid"
      ) {
        const intentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!intentId)
          throw new ValidationError({
            message: "Paid checkout has no payment reference.",
          });
        order = await tx.giftCardOrder.update({
          where: { id },
          data: {
            status: "PAID",
            paid_at: order.paid_at ?? new Date(),
            stripe_session_id: session.id,
            stripe_payment_intent_id: intentId,
            checkout_url: null,
            last_error: null,
          },
        });
        return issue(tx, order);
      }
      // Terminal financial confirmation is monotonic: delayed cancellation
      // or failure events cannot undo an already confirmed payment.
      if (order.paid_at || session.payment_status === "paid") return order;
      if (expired && session.status === "expired") {
        return tx.giftCardOrder.update({
          where: { id },
          data: { status: "CANCELLED", checkout_url: null },
        });
      }
      if (failure && session.status === "complete") {
        return tx.giftCardOrder.update({
          where: { id },
          data: {
            status: "PAYMENT_FAILED",
            checkout_url: null,
            last_error: "PAYMENT_FAILED",
          },
        });
      }
      if (declined && session.status === "open") {
        return tx.giftCardOrder.update({
          where: { id },
          data: { last_error: "PAYMENT_ATTEMPT_FAILED" },
        });
      }
      return order;
    }, transactionOptions);
    // Tell Stripe to retry, while keeping the paid/failure state committed.
    if (success && result.status === "ISSUANCE_FAILED")
      throw new ServiceError({
        message: "Gift card issuance is pending. Retry the notification.",
      });
  }

  async function findOwn(userId: string, id: string) {
    assertGiftCardSandbox();
    const order = await prisma.giftCardOrder.findFirst({
      where: { id, user_id: userId },
    });
    if (!order)
      throw new NotFoundError({ message: "Gift card order not found." });
    return order;
  }

  async function listOwn(userId: string) {
    assertGiftCardSandbox();
    return prisma.giftCardOrder.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 50,
    });
  }

  return { begin, checkout, cancel, retryIssuance, receive, findOwn, listOwn };
}

// An explicit projection, only after ownership checks. No user ID, Stripe
// identifiers, idempotency keys, provider references or raw payment payloads.
export function giftCardOrderOutput(order: GiftCardOrder) {
  return {
    id: order.id,
    product_code: order.product_code,
    product_name: order.product_name,
    amount_minor: order.amount_minor,
    currency: order.currency,
    status: order.status,
    checkout_url:
      order.status === "AWAITING_PAYMENT" ? order.checkout_url : null,
    gift_card_code: order.status === "FULFILLED" ? order.gift_card_code : null,
    last_error: order.last_error,
    created_at: order.created_at.toISOString(),
    paid_at: order.paid_at?.toISOString() ?? null,
    fulfilled_at: order.fulfilled_at?.toISOString() ?? null,
  };
}

export default createGiftCardOrderService();
