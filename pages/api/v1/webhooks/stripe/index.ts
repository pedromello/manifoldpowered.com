import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import { verifyStripeEvent } from "infra/stripe_checkout";
import giftCardOrder from "models/gift_card_order";

export const config = { api: { bodyParser: false } };

export default createRouter<NextApiRequest, NextApiResponse>()
  .post(async (req, res) => {
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
    await giftCardOrder.receive(event);
    res.status(200).json({ received: true });
  })
  .handler(controller.errorHandlers);
