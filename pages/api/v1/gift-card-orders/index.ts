import { createRouter } from "next-connect";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import giftCardOrder, { giftCardOrderOutput } from "models/gift_card_order";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";
import { stripeCheckoutConfigured } from "infra/stripe_checkout";

const bodySchema = z
  .object({
    product_code: z.string().min(1).max(100),
    idempotency_key: z.uuid(),
  })
  .strict();

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    return next();
  })
  .get(controller.canRequest("read:library"), async (req, res) => {
    const [products, orders] = await Promise.all([
      simulatedGiftCardProvider.products(),
      giftCardOrder.listOwn(req.context.user.id!),
    ]);
    res.status(200).json({
      products,
      orders: orders.map(giftCardOrderOutput),
      checkout_available: stripeCheckoutConfigured(),
    });
  })
  .post(controller.canRequest("create:library"), async (req, res) => {
    const body = bodySchema.safeParse(req.body);
    if (!body.success)
      throw new ValidationError({
        message: "Invalid gift card purchase request.",
      });
    const order = await giftCardOrder.begin(
      req.context.user.id!,
      body.data.product_code,
      body.data.idempotency_key,
    );
    res.status(200).json(giftCardOrderOutput(order));
  })
  .handler(controller.errorHandlers);
