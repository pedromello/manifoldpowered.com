import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { assertGiftCardSandbox } from "infra/gift_card_provider";
import {
  stripeCheckoutGateway,
  type CheckoutGateway,
} from "infra/stripe_checkout";
import giftCardOrder, {
  lockGiftCardOrder,
  giftCardDatabaseClock,
} from "models/gift_card_order";
import type { Prisma } from "generated/prisma/client";

const COOLDOWN_MS = 60000;
const QUERY_TIMEOUT_MS = 25000;
const CLAIM_MS = 45000;
const transactionOptions = { maxWait: 5000, timeout: 5000 };

export function createGiftCardPaymentReconciliation({
  gateway = stripeCheckoutGateway,
  orders = giftCardOrder,
  clock = giftCardDatabaseClock,
  queryTimeoutMs = QUERY_TIMEOUT_MS,
}: {
  gateway?: CheckoutGateway;
  orders?: typeof giftCardOrder;
  clock?: (tx: Prisma.TransactionClient) => Promise<Date>;
  queryTimeoutMs?: number;
} = {}) {
  if (
    !Number.isSafeInteger(queryTimeoutMs) ||
    queryTimeoutMs <= 0 ||
    queryTimeoutMs >= CLAIM_MS
  )
    throw new RangeError("Invalid checkout reconciliation timeout");
  async function reserve(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const order = await lockGiftCardOrder(tx, id, userId);
      const now = await clock(tx);
      if (
        order.paid_at ||
        !order.stripe_session_id ||
        !["CHECKOUT_PENDING", "AWAITING_PAYMENT"].includes(order.status) ||
        (order.payment_reconcile_after &&
          order.payment_reconcile_after > now) ||
        (order.payment_reconcile_claim_expires_at &&
          order.payment_reconcile_claim_expires_at > now)
      )
        return { order, token: null };
      const token = randomUUID();
      await tx.giftCardOrder.update({
        where: { id },
        data: {
          payment_reconcile_after: new Date(now.getTime() + COOLDOWN_MS),
          payment_reconcile_claim_token: token,
          payment_reconcile_claim_expires_at: new Date(
            now.getTime() + CLAIM_MS,
          ),
        },
      });
      return { order, token };
    }, transactionOptions);
  }

  async function query(sessionId: string) {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        gateway.retrieve(sessionId),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Checkout query timed out")),
            queryTimeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function reconcileOwn(userId: string, id: string) {
    assertGiftCardSandbox();
    const reservation = await reserve(userId, id);
    if (reservation.token) {
      try {
        const session = await query(reservation.order.stripe_session_id!);
        await orders.confirmPayment(id, session);
      } catch {
        // An unavailable or mismatched session never implies failed/cancelled payment.
      } finally {
        await prisma.giftCardOrder.updateMany({
          where: { id, payment_reconcile_claim_token: reservation.token },
          data: {
            payment_reconcile_claim_token: null,
            payment_reconcile_claim_expires_at: null,
          },
        });
      }
    }
    const order = await orders.findOwn(userId, id);
    return {
      order,
      needsDelivery: Boolean(order.paid_at && order.status !== "FULFILLED"),
    };
  }
  return { reconcileOwn };
}
export default createGiftCardPaymentReconciliation();
