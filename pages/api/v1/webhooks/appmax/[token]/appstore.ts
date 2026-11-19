import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { prisma } from "infra/database";
import { assertPaymentSandbox } from "infra/payments/config";
import { decodeAppmaxAppstorePaymentWebhook } from "infra/payments/webhooks";
import { enqueuePaymentSignal } from "models/purchase_order";

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
    const attempt = await prisma.purchasePaymentAttempt.findUnique({
      where: {
        payment_provider_payment_environment_remote_order_id: {
          ...scope,
          remote_order_id: remoteOrderId,
        },
      },
      select: { id: true, order_id: true },
    });
    const order =
      attempt &&
      (await prisma.purchaseOrder.findFirst({
        where: { ...scope, id: attempt.order_id },
        select: { id: true },
      }));
    if (attempt && order) await enqueuePaymentSignal(order.id, attempt.id);
  }

  return res.status(200).json({ received: true });
}
