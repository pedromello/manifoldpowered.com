import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { prisma } from "infra/database";
import { assertPaymentSandbox } from "infra/payments/config";
import { decodeAppmaxAppstorePaymentWebhook } from "infra/payments/webhooks";
import { enqueuePaymentSignal } from "models/purchase_order";
import paymentWorker from "models/purchase_payment_jobs";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default createRouter<NextApiRequest, NextApiResponse>()
  .post(receiveAppstoreWebhook)
  .handler(controller.errorHandlers);

async function receiveAppstoreWebhook(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const remoteOrderId = decodeAppmaxAppstorePaymentWebhook(
    req.body,
    req.query.token,
  );
  assertPaymentSandbox();

  if (remoteOrderId) {
    const scope = {
      payment_provider: "appmax",
      payment_environment: "sandbox",
    };
    const attempt =
      (await prisma.purchasePaymentAttempt.findUnique({
        where: {
          payment_provider_payment_environment_remote_order_id: {
            ...scope,
            remote_order_id: remoteOrderId,
          },
        },
        select: { id: true, order_id: true, method: true },
      })) ??
      (!remoteOrderId.startsWith("link:")
        ? await prisma.purchasePaymentAttempt.findFirst({
            where: {
              ...scope,
              method: "link",
              remote_payment_id: remoteOrderId,
            },
            select: { id: true, order_id: true, method: true },
          })
        : null);
    const order =
      attempt &&
      (await prisma.purchaseOrder.findFirst({
        where: { ...scope, id: attempt.order_id },
        select: { id: true },
      }));
    if (attempt && order) {
      await enqueuePaymentSignal(order.id, attempt.id);
      if (attempt.method === "link")
        await paymentWorker.runOneDetailed(order.id);
    }
  }

  return res.status(200).json({ received: true });
}
