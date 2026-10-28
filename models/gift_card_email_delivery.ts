import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { ConflictError } from "infra/errors";
import {
  GiftCardApiError,
  emailGiftProvider,
  type EmailGiftProvider,
  type EmailGiftTracking,
} from "infra/gift_card_api";
import { decryptGiftRecipient } from "infra/gift_card_recipient";
import { assertGiftCardSandbox } from "infra/gift_card_provider";
import type { Prisma } from "generated/prisma/client";

const SIX_HOURS = 6 * 60 * 60 * 1000;
export async function enqueueGiftFulfillment(
  id: string,
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.giftCardFulfillmentJob.upsert({
    where: { order_id: id },
    create: { order_id: id },
    update: {},
  });
}
export function createEmailGiftDelivery({
  getProvider = emailGiftProvider,
}: { getProvider?: () => EmailGiftProvider } = {}) {
  async function runOne(
    phase: "submit" | "track",
    options: { order_id?: string; force?: boolean } = {},
  ) {
    assertGiftCardSandbox();
    if (
      options.force &&
      (!options.order_id ||
        !(
          ["development", "test"].includes(process.env.NODE_ENV) ||
          process.env.APP_ENV === "hml"
        ))
    )
      throw new ConflictError({
        message: "Early tracking is available only in homologation.",
      });
    const provider = getProvider(); // Validate configuration before reserving a side effect.
    const token = randomUUID();
    const claim = await prisma.$transaction(async (tx) => {
      const [job] = await tx.$queryRaw<{ order_id: string }[]>`
        SELECT j.order_id FROM gift_card_fulfillment_jobs j
        JOIN gift_card_orders g ON g.id=j.order_id
        JOIN purchase_orders p ON p.gift_card_order_id=g.id
        WHERE g.delivery_channel='EMAIL'
          AND (${options.order_id ?? null}::text IS NULL OR j.order_id=${options.order_id ?? null})
          AND (j.claim_until IS NULL OR j.claim_until<clock_timestamp())
          AND ((${phase}='submit' AND g.submitted_at IS NULL) OR (${phase}='track' AND g.submitted_at IS NOT NULL))
          AND ((j.run_after<=clock_timestamp() AND (g.next_tracking_at IS NULL OR g.next_tracking_at<=clock_timestamp()))
            OR (${Boolean(options.force)} AND (g.last_tracking_at IS NULL OR g.last_tracking_at<=clock_timestamp()-interval '1 minute')))
        ORDER BY j.run_after FOR UPDATE OF p SKIP LOCKED LIMIT 1`;
      if (!job) return null;
      // All writers lock purchase before gift. Never reverse this lock order.
      const [purchase] = await tx.$queryRaw<
        { payment_status: string; delivery_status: string }[]
      >`SELECT payment_status,delivery_status FROM purchase_orders WHERE gift_card_order_id=${job.order_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM gift_card_orders WHERE id=${job.order_id} FOR UPDATE`;
      const gift = await tx.giftCardOrder.findUniqueOrThrow({
        where: { id: job.order_id },
      });
      const [currentJob] = await tx.$queryRaw<
        { run_after: Date; claim_until: Date | null; now: Date }[]
      >`SELECT run_after,claim_until,clock_timestamp() AS now FROM gift_card_fulfillment_jobs WHERE order_id=${job.order_id} FOR UPDATE`;
      if (
        !currentJob ||
        (currentJob.claim_until && currentJob.claim_until > currentJob.now)
      )
        return null;
      const due =
        currentJob.run_after <= currentJob.now &&
        (!gift.next_tracking_at || gift.next_tracking_at <= currentJob.now);
      const early =
        options.force &&
        (!gift.last_tracking_at ||
          currentJob.now.getTime() - gift.last_tracking_at.getTime() >= 60000);
      if (
        (!due && !early) ||
        (phase === "submit") !== (gift.submitted_at === null)
      )
        return null;
      const terminal =
        gift.fulfillment_status === "DELIVERED" ||
        gift.fulfillment_status === "CANCELLED";
      if (
        terminal ||
        !purchase ||
        (!gift.submitted_at &&
          (purchase.payment_status !== "PAID" ||
            purchase.delivery_status === "REVIEW"))
      ) {
        await tx.giftCardFulfillmentJob.delete({
          where: { order_id: gift.id },
        });
        return null;
      }
      if (
        !gift.paid_at ||
        !gift.recipient_confirmed_at ||
        !gift.recipient_email ||
        !gift.recipient_data ||
        !gift.provider_sku ||
        gift.provider_environment !== "sandbox"
      ) {
        await tx.giftCardOrder.update({
          where: { id: gift.id },
          data: {
            fulfillment_status: "REVIEW",
            last_error: "RECIPIENT_REVIEW",
          },
        });
        await tx.purchaseOrder.updateMany({
          where: { gift_card_order_id: gift.id },
          data: { delivery_status: "REVIEW" },
        });
        await tx.giftCardFulfillmentJob.delete({
          where: { order_id: gift.id },
        });
        return null;
      }
      let recipient: ReturnType<typeof decryptGiftRecipient> | null = null;
      try {
        if (!gift.submitted_at && !gift.issuance_started_at)
          recipient = decryptGiftRecipient(gift.recipient_data, gift.id);
      } catch {
        await tx.giftCardOrder.update({
          where: { id: gift.id },
          data: {
            fulfillment_status: "REVIEW",
            last_error: "RECIPIENT_REVIEW",
          },
        });
        await tx.purchaseOrder.updateMany({
          where: { gift_card_order_id: gift.id },
          data: { delivery_status: "REVIEW" },
        });
        await tx.giftCardFulfillmentJob.delete({
          where: { order_id: gift.id },
        });
        return null;
      }
      await tx.giftCardFulfillmentJob.update({
        where: { order_id: gift.id },
        data: {
          claim_token: token,
          claim_until: new Date(currentJob.now.getTime() + 60000),
          attempts: { increment: 1 },
        },
      });
      const reconciling = gift.issuance_started_at !== null;
      await tx.giftCardOrder.update({
        where: { id: gift.id },
        data: {
          issuance_started_at: gift.issuance_started_at ?? new Date(),
          fulfillment_status: gift.submitted_at
            ? gift.fulfillment_status
            : "SUBMITTING",
          ...(phase === "track" || reconciling
            ? { last_tracking_at: new Date() }
            : {}),
        },
      });
      return { gift, reconciling, recipient };
    });
    if (!claim) return false;
    let result: EmailGiftTracking | undefined;
    let errorCode: string | null = null,
      retryAfter = 0;
    try {
      if (phase === "track" || claim.reconciling)
        result = await provider.track(claim.gift.id);
      else {
        result = await provider.submit({
          request_id: claim.gift.id,
          sku: claim.gift.provider_sku!,
          amount_minor: claim.gift.amount_minor,
          recipient: {
            ...claim.recipient!,
            email: claim.gift.recipient_email!,
          },
        });
      }
      if (result.status === "unknown") errorCode = "TRACKING_UNKNOWN";
      if (
        result.status === "delivered" &&
        !result.reference &&
        !claim.gift.provider_reference
      ) {
        result = { ...result, status: "unknown" };
        errorCode = "TRACKING_UNKNOWN";
      }
    } catch (error) {
      errorCode =
        phase === "submit" ? "SUBMISSION_UNCERTAIN" : "TRACKING_UNAVAILABLE";
      retryAfter = error instanceof GiftCardApiError ? error.retry_after_ms : 0;
    }
    await prisma.$transaction(async (tx) => {
      const [purchase] = await tx.$queryRaw<
        { id: string; payment_status: string; delivery_status: string }[]
      >`SELECT id,payment_status,delivery_status FROM purchase_orders WHERE gift_card_order_id=${claim.gift.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM gift_card_orders WHERE id=${claim.gift.id} FOR UPDATE`;
      const [fence] = await tx.$queryRaw<
        { claim_token: string; valid: boolean }[]
      >`SELECT claim_token,claim_until>clock_timestamp() AS valid FROM gift_card_fulfillment_jobs WHERE order_id=${claim.gift.id} FOR UPDATE`;
      if (fence?.claim_token !== token || !fence.valid) return;
      const delivered = result?.status === "delivered",
        cancelled = result?.status === "cancelled";
      const financiallyEligible =
        purchase?.payment_status === "PAID" &&
        purchase.delivery_status !== "REVIEW";
      const next = new Date(Date.now() + Math.max(SIX_HOURS, retryAfter));
      await tx.giftCardOrder.update({
        where: { id: claim.gift.id },
        data: {
          submitted_at: claim.gift.submitted_at ?? new Date(),
          fulfillment_status: delivered
            ? "DELIVERED"
            : cancelled
              ? "CANCELLED"
              : financiallyEligible
                ? "PROCESSING"
                : "REVIEW",
          provider_reference:
            result?.reference ?? claim.gift.provider_reference,
          provider_status:
            result?.provider_status ?? claim.gift.provider_status,
          next_tracking_at: delivered || cancelled ? null : next,
          last_error: errorCode,
          ...(delivered
            ? {
                status: "FULFILLED",
                fulfilled_at: new Date(),
                gift_card_code: null,
              }
            : cancelled
              ? { status: "ISSUANCE_FAILED", last_error: "DELIVERY_CANCELLED" }
              : {}),
        },
      });
      if (delivered && financiallyEligible) {
        await tx.libraryItem.upsert({
          where: {
            user_id_item_id_item_type: {
              user_id: claim.gift.user_id,
              item_id: claim.gift.id,
              item_type: "GIFT_CARD",
            },
          },
          create: {
            user_id: claim.gift.user_id,
            item_id: claim.gift.id,
            item_type: "GIFT_CARD",
          },
          update: {},
        });
        await tx.purchaseOrder.update({
          where: { id: purchase.id },
          data: { delivery_status: "READY", fulfilled_at: new Date() },
        });
      } else if (cancelled || !financiallyEligible) {
        await tx.purchaseOrder.updateMany({
          where: { gift_card_order_id: claim.gift.id },
          data: { delivery_status: "REVIEW" },
        });
      }
      if (delivered || cancelled)
        await tx.giftCardFulfillmentJob.delete({
          where: { order_id: claim.gift.id },
        });
      else
        await tx.giftCardFulfillmentJob.update({
          where: { order_id: claim.gift.id },
          data: {
            claim_token: null,
            claim_until: null,
            run_after: next,
            last_error: errorCode,
          },
        });
    });
    return true;
  }
  return { runOne };
}
export default createEmailGiftDelivery();
