import { createRouter } from "next-connect";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import giftCardOrder, { giftCardOrderOutput } from "models/gift_card_order";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";
import { paymentsConfigured } from "infra/payments";
import purchases from "models/purchase_order";

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
      checkout_available: paymentsConfigured(),
    });
  })
  .post(controller.canRequest("create:library"), async (req, res) => {
    const body = bodySchema.safeParse(req.body);
    if (!body.success)
      throw new ValidationError({
        message: "Invalid gift card purchase request.",
      });
    const order = await purchases.begin(req.context.user.id!, {
      item_type: "GIFT_CARD",
      item_id: body.data.product_code,
      idempotency_key: body.data.idempotency_key,
    });
    const gift = await giftCardOrder.findOwn(
      req.context.user.id!,
      order.gift_card_order_id!,
    );
    res.status(200).json({
      ...giftCardOrderOutput(gift),
      checkout_url: `/checkout/${order.id}`,
    });
  })
  .handler(controller.errorHandlers);
