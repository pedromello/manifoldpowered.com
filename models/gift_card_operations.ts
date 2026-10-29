import { prisma } from "infra/database";
import { assertGiftCardSandbox } from "infra/gift_card_provider";
import { NotFoundError } from "infra/errors";
import { syncGiftCardCatalog } from "models/gift_card_catalog";
import paymentWorker from "models/purchase_payment_jobs";
import emailDelivery from "models/gift_card_email_delivery";

export type OperationReport = {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  last_error: string | null;
};
// Each invocation has bounded work and awaits all effects before responding.
async function batch(
  run: () => Promise<boolean>,
  remaining: () => Promise<number>,
): Promise<OperationReport> {
  const started = Date.now(),
    report: OperationReport = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      last_error: null,
    };
  while (report.processed < 5 && Date.now() - started < 20000) {
    try {
      if (!(await run())) break;
      report.processed++;
      report.succeeded++;
    } catch {
      report.failed++;
      report.last_error = "OPERATION_UNAVAILABLE";
      break;
    }
  }
  report.remaining = await remaining();
  return report;
}
async function summary() {
  assertGiftCardSandbox();
  const [
    products,
    sync,
    payment_jobs,
    submission_jobs,
    tracking_jobs,
    review_orders,
    recent_orders,
  ] = await Promise.all([
    prisma.giftCardProduct.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        amount_minor: true,
        currency: true,
        enabled: true,
        available: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.giftCardCatalogSync.findUnique({ where: { id: "catalog" } }),
    prisma.purchasePaymentJob.count(),
    prisma.giftCardOrder.count({
      where: {
        delivery_channel: "EMAIL",
        paid_at: { not: null },
        submitted_at: null,
        fulfillment_status: { in: ["QUEUED", "SUBMITTING"] },
      },
    }),
    prisma.giftCardFulfillmentJob.count(),
    prisma.giftCardOrder.count({
      where: {
        delivery_channel: "EMAIL",
        fulfillment_status: { in: ["REVIEW", "CANCELLED"] },
      },
    }),
    prisma.giftCardOrder.findMany({
      where: { delivery_channel: "EMAIL" },
      select: {
        id: true,
        fulfillment_status: true,
        last_error: true,
        next_tracking_at: true,
      },
      orderBy: { updated_at: "desc" },
      take: 20,
    }),
  ]);
  return {
    products,
    last_sync_at: sync?.last_success_at?.toISOString() ?? null,
    last_error: sync?.last_error ?? null,
    payment_jobs,
    submission_jobs,
    tracking_jobs,
    review_orders,
    recent_orders: recent_orders.map((order) => ({
      ...order,
      next_tracking_at: order.next_tracking_at?.toISOString() ?? null,
    })),
  };
}
async function syncCatalog(): Promise<OperationReport> {
  const count = await syncGiftCardCatalog();
  return {
    processed: count,
    succeeded: count,
    failed: 0,
    remaining: 0,
    last_error: null,
  };
}
async function reconcilePayments() {
  assertGiftCardSandbox();
  return batch(
    () => paymentWorker.runOne(),
    () => prisma.purchasePaymentJob.count(),
  );
}
async function submitPaidOrders() {
  assertGiftCardSandbox();
  return batch(
    () => emailDelivery.runOne("submit"),
    () => prisma.giftCardFulfillmentJob.count(),
  );
}
async function trackDeliveries(
  options: { order_id?: string; force?: boolean } = {},
) {
  assertGiftCardSandbox();
  let used = false;
  return batch(
    () => {
      if (options.order_id && used) return Promise.resolve(false);
      used = true;
      return emailDelivery.runOne("track", options);
    },
    () => prisma.giftCardFulfillmentJob.count(),
  );
}
async function setProductEnabled(code: string, enabled: boolean) {
  assertGiftCardSandbox();
  const result = await prisma.giftCardProduct.updateMany({
    where: { code, ...(enabled ? { available: true } : {}) },
    data: { enabled },
  });
  if (!result.count)
    throw new NotFoundError({ message: "Gift card product is unavailable." });
}
const giftCardOperations = {
  summary,
  syncCatalog,
  reconcilePayments,
  submitPaidOrders,
  trackDeliveries,
  setProductEnabled,
};
export default giftCardOperations;
