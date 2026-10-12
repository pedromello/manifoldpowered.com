import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { ConflictError } from "infra/errors";
import purchaseOrder from "models/purchase_order";
import { assertPaymentSandbox } from "infra/payments";
import { PaymentTransportError } from "infra/payments/errors";

export function createPurchasePaymentWorker({
  orders = purchaseOrder,
}: { orders?: Pick<typeof purchaseOrder, "reconcile"> } = {}) {
  async function runOne(onlyOrderId?: string) {
    assertPaymentSandbox();
    const token = randomUUID();
    const claim = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { order_id: string }[]
      >`SELECT order_id FROM purchase_payment_jobs WHERE (${onlyOrderId ?? null}::text IS NULL OR order_id=${onlyOrderId ?? null}) AND run_after<=clock_timestamp() AND (claim_until IS NULL OR claim_until<clock_timestamp()) ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!row) return null;
      return tx.purchasePaymentJob.update({
        where: { order_id: row.order_id },
        data: {
          claim_token: token,
          claim_until: new Date(Date.now() + 90000),
          attempts: { increment: 1 },
        },
      });
    });
    if (!claim) return false;
    let failure: string | null = null;
    let retryAfter = 0;
    try {
      await orders.reconcile(claim.order_id);
    } catch (error) {
      if (error instanceof PaymentTransportError)
        retryAfter = error.retryAfter * 1000;
      failure =
        error instanceof ConflictError
          ? "MANUAL_REVIEW"
          : "RECONCILIATION_UNAVAILABLE";
    }
    await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { claim_token: string | null; updated_at: Date }[]
      >`SELECT claim_token,updated_at FROM purchase_payment_jobs WHERE order_id=${claim.order_id} FOR UPDATE`;
      if (row?.claim_token !== token) return;
      const order = await tx.purchaseOrder.findUnique({
        where: { id: claim.order_id },
      });
      if (
        !order ||
        ((["CANCELLED", "FAILED", "REFUNDED", "DISPUTED"].includes(
          order.payment_status,
        ) ||
          (order.payment_status === "PAID" &&
            order.delivery_status === "READY")) &&
          !failure)
      ) {
        // A signal received during the claim gets one more trusted query.
        if (row.updated_at.getTime() <= claim.updated_at.getTime()) {
          await tx.purchasePaymentJob.delete({
            where: { order_id: claim.order_id },
          });
          return;
        }
      }
      const wait =
        failure === "MANUAL_REVIEW"
          ? 3600000
          : Math.max(
              retryAfter,
              Math.min(
                15 * 60000,
                15000 * 2 ** Math.min(claim.attempts - 1, 6),
              ),
            );
      await tx.purchasePaymentJob.update({
        where: { order_id: claim.order_id },
        data: {
          claim_token: null,
          claim_until: null,
          last_error: failure,
          run_after:
            row.updated_at > claim.updated_at && !retryAfter
              ? new Date()
              : new Date(Date.now() + wait),
        },
      });
    });
    return true;
  }
  return { runOne };
}
export default createPurchasePaymentWorker();
