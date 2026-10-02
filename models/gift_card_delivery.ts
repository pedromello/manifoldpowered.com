import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "infra/database";
import { ConflictError, ServiceError } from "infra/errors";
import {
  assertGiftCardSandbox,
  simulatedGiftCardProvider,
  type GiftCardProvider,
  type GiftCardIssueRequest,
  type GiftCardDelivery,
} from "infra/gift_card_provider";
import {
  lockGiftCardOrder,
  giftCardProductSnapshot,
  giftCardDatabaseClock,
} from "models/gift_card_order";
import type { GiftCardOrder, Prisma } from "generated/prisma/client";

const transactionOptions = { maxWait: 5000, timeout: 5000 };
const deliverySchema = z
  .object({ reference: z.string().min(1), code: z.string().min(1) })
  .strict();
type Claim = { order: GiftCardOrder; token: string; reconcile: boolean };

export function createGiftCardDeliveryService({
  provider = simulatedGiftCardProvider,
  timeoutMs = 10000,
}: { provider?: GiftCardProvider; timeoutMs?: number } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new RangeError("Invalid supplier timeout");
  const leaseMs = timeoutMs * 2 + 30000;

  async function claim(
    id: string,
    userId?: string,
  ): Promise<Claim | GiftCardOrder> {
    return prisma.$transaction(async (tx) => {
      const order = await lockGiftCardOrder(tx, id, userId);
      if (order.status === "FULFILLED") return order;
      if (!order.paid_at || !["PAID", "ISSUANCE_FAILED"].includes(order.status))
        throw new ConflictError({ message: "Payment has not been confirmed." });
      const now = await giftCardDatabaseClock(tx);
      if (
        order.delivery_claim_expires_at &&
        order.delivery_claim_expires_at > now
      )
        throw pendingDelivery();
      const token = randomUUID();
      const claimed = await tx.giftCardOrder.update({
        where: { id },
        data: {
          delivery_claim_token: token,
          delivery_claim_expires_at: new Date(now.getTime() + leaseMs),
          issuance_started_at: order.issuance_started_at ?? now,
        },
      });
      return {
        order: claimed,
        token,
        reconcile: order.issuance_started_at !== null,
      };
    }, transactionOptions);
  }

  async function fence(tx: Prisma.TransactionClient, reservation: Claim) {
    const order = await lockGiftCardOrder(tx, reservation.order.id);
    const now = await giftCardDatabaseClock(tx);
    if (
      order.delivery_claim_token !== reservation.token ||
      !order.delivery_claim_expires_at ||
      order.delivery_claim_expires_at <= now
    )
      throw pendingDelivery();
    return order;
  }

  async function supplierOperation<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(pendingDelivery());
      }, timeoutMs);
    });
    try {
      return await Promise.race([operation(abort.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveDelivery(reservation: Claim) {
    const request: GiftCardIssueRequest = {
      request_id: reservation.order.id,
      product: giftCardProductSnapshot(reservation.order),
    };
    if (reservation.reconcile) {
      const result = await supplierOperation((signal) =>
        provider.reconcile(request, signal),
      );
      if (result.status === "issued")
        return deliverySchema.parse(result.delivery);
      if (result.status !== "not_issued") throw pendingDelivery();
      await prisma.$transaction(
        (tx) => fence(tx, reservation),
        transactionOptions,
      );
    }
    return deliverySchema.parse(
      await supplierOperation((signal) => provider.issue(request, signal)),
    );
  }

  async function complete(reservation: Claim, delivery: GiftCardDelivery) {
    return prisma.$transaction(async (tx) => {
      const order = await fence(tx, reservation);
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
          delivery_claim_token: null,
          delivery_claim_expires_at: null,
        },
      });
    }, transactionOptions);
  }

  async function fail(reservation: Claim) {
    await prisma.$transaction(async (tx) => {
      await lockGiftCardOrder(tx, reservation.order.id);
      const now = await giftCardDatabaseClock(tx);
      await tx.giftCardOrder.updateMany({
        where: {
          id: reservation.order.id,
          delivery_claim_token: reservation.token,
          delivery_claim_expires_at: { gt: now },
        },
        data: {
          status: "ISSUANCE_FAILED",
          last_error: "ISSUANCE_FAILED",
          delivery_claim_token: null,
          delivery_claim_expires_at: null,
        },
      });
    }, transactionOptions);
  }

  async function fulfill(id: string, userId?: string) {
    assertGiftCardSandbox();
    const reservation = await claim(id, userId);
    if (!("token" in reservation)) return reservation;
    try {
      return await complete(reservation, await resolveDelivery(reservation));
    } catch {
      // Never log supplier payloads or ORM errors containing the secret code.
      await fail(reservation).catch(() => undefined);
      throw pendingDelivery();
    }
  }
  return { fulfill };
}

function pendingDelivery() {
  return new ServiceError({
    message: "Gift card issuance is pending. Retry the notification.",
    action: "Retry delivery without starting another payment.",
  });
}

export default createGiftCardDeliveryService();
