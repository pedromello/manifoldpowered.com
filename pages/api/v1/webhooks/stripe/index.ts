import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import { verifyStripeEvent } from "infra/stripe_checkout";
import giftCardOrder from "models/gift_card_order";
import giftCardDelivery from "models/gift_card_delivery";
import { prisma } from "infra/database";
import { enqueuePaymentSignal } from "models/purchase_order";
import { stripePaymentSignal } from "infra/payments/stripe";
import { assertPaymentSandbox } from "infra/payments";

export const config = { api: { bodyParser: false } };

export default createRouter<NextApiRequest, NextApiResponse>()
  .post(postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  assertPaymentSandbox();
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string")
    throw new ValidationError({
      message: "Missing Stripe webhook signature.",
    });
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024 * 1024)
      throw new ValidationError({ message: "Webhook payload is too large." });
    chunks.push(buffer);
  }
  const event = verifyStripeEvent(Buffer.concat(chunks), signature);
  const signal = stripePaymentSignal(event);
  if (
    signal &&
    (signal.remote_order_id || signal.remote_payment_id || signal.order_id)
  ) {
    const attempt = await prisma.purchasePaymentAttempt.findFirst({
      where: {
        payment_provider: "stripe",
        payment_environment: "sandbox",
        OR: [
          ...(signal.remote_order_id
            ? [{ remote_order_id: signal.remote_order_id }]
            : []),
          ...(signal.remote_payment_id
            ? [{ remote_payment_id: signal.remote_payment_id }]
            : []),
          ...(signal.order_id ? [{ order_id: signal.order_id }] : []),
        ],
      },
    });
    if (attempt) {
      const order = await prisma.purchaseOrder.findFirst({
        where: {
          id: attempt.order_id,
          payment_provider: "stripe",
          payment_environment: "sandbox",
        },
      });
      if (order) {
        await enqueuePaymentSignal(order.id, attempt.id);
        return res.status(200).json({ received: true });
      }
    }
  }
  const paidOrder = await giftCardOrder.receive(event);
  if (paidOrder) await giftCardDelivery.fulfill(paidOrder.id);
  res.status(200).json({ received: true });
}
