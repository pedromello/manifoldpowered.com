import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import orders from "models/purchase_order";

const body = z
  .object({
    item_type: z.enum(["GAME", "GIFT_CARD"]),
    item_id: z.string().min(1).max(255),
    idempotency_key: z.uuid(),
    store_slug: z.string().min(1).max(255).optional(),
  })
  .strict();
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    return next();
  })
  .get(controller.canRequest("read:library"), async (req, res) =>
    res
      .status(200)
      .json({ orders: await orders.listOwn(req.context.user.id!) }),
  )
  .post(controller.canRequest("create:library"), async (req, res) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success)
      throw new ValidationError({
        message: "Please check your purchase details.",
      });
    const order = await orders.begin(req.context.user.id!, parsed.data);
    return res
      .status(201)
      .json({ id: order.id, checkout_url: `/checkout/${order.id}` });
  })
  .handler(controller.errorHandlers);
