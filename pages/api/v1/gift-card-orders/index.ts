import { createRouter } from "next-connect";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import { prisma } from "infra/database";
import giftCardOrder, { giftCardOrderOutput } from "models/gift_card_order";
import { giftCardProducts } from "models/gift_card_catalog";
import { paymentsConfigured } from "infra/payments";
import purchases, { orderOutput } from "models/purchase_order";
import {
  emailGiftCardsSelected,
  emailGiftPurchasesConfigured,
} from "infra/gift_card_api";

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
      giftCardProducts(),
      giftCardOrder.listOwn(req.context.user.id!),
    ]);
    const pendingGiftIds = orders
      .filter((order) =>
        ["CHECKOUT_PENDING", "AWAITING_PAYMENT", "PAYMENT_FAILED"].includes(
          order.status,
        ),
      )
      .map((order) => order.id);
    const linkedOrders = pendingGiftIds.length
      ? await prisma.purchaseOrder.findMany({
          where: {
            user_id: req.context.user.id!,
            payment_environment: "sandbox",
            gift_card_order_id: { in: pendingGiftIds },
          },
        })
      : [];
    const latestAttempts = linkedOrders.length
      ? await prisma.purchasePaymentAttempt.findMany({
          where: { order_id: { in: linkedOrders.map((order) => order.id) } },
          distinct: ["order_id"],
          orderBy: { created_at: "desc" },
        })
      : [];
    const attemptByOrder = new Map(
      latestAttempts.map((attempt) => [attempt.order_id, attempt]),
    );
    const cancellationByGift = new Map(
      linkedOrders.map((order) => [
        order.gift_card_order_id,
        orderOutput(order, attemptByOrder.get(order.id)).can_cancel,
      ]),
    );
    res.status(200).json({
      products,
      orders: orders.map((order) => {
        const canCancel = cancellationByGift.get(order.id);
        return {
          ...giftCardOrderOutput(order),
          ...(canCancel === undefined ? {} : { can_cancel: canCancel }),
        };
      }),
      checkout_available:
        paymentsConfigured() &&
        (!emailGiftCardsSelected() || emailGiftPurchasesConfigured()),
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
