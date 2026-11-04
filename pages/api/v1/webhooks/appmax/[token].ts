import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { NotFoundError } from "infra/errors";
import { assertPaymentSandbox } from "infra/payments";
import {
  acceptsAppmaxWebhookToken,
  decodeAppmaxPaymentWebhook,
} from "infra/payments/webhooks";
import { prisma } from "infra/database";
import { enqueuePaymentSignal } from "models/purchase_order";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
export default createRouter<NextApiRequest, NextApiResponse>()
  .post(async (req, res) => {
    assertPaymentSandbox();
    if (!acceptsAppmaxWebhookToken(req.query.token))
      throw new NotFoundError({ message: "Not found." });
    const signal = decodeAppmaxPaymentWebhook(req.body);
    if (signal) {
      const attempts = await prisma.purchasePaymentAttempt.findMany({
        where: {
          remote_order_id: signal.remote_order_id,
          payment_provider: "appmax",
          payment_environment: "sandbox",
        },
        select: { id: true, order_id: true },
      });
      const bound = await prisma.purchaseOrder.findMany({
        where: {
          id: { in: attempts.map((item) => item.order_id) },
          payment_provider: "appmax",
          payment_environment: "sandbox",
        },
        select: { id: true },
      });
      for (const order of bound)
        for (const attempt of attempts.filter(
          (item) => item.order_id === order.id,
        ))
          await enqueuePaymentSignal(order.id, attempt.id);
    }
    return res.status(200).json({ received: true });
  })
  .handler(controller.errorHandlers);
