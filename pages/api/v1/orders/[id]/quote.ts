import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import orders from "models/purchase_order";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!z.uuid().safeParse(req.query.id).success)
      throw new ValidationError({ message: "Order not found." });
    return next();
  })
  .get(controller.canRequest("read:library"), async (req, res) =>
    res
      .status(200)
      .json(await orders.quotes(req.context.user.id!, String(req.query.id))),
  )
  .post(controller.canRequest("create:library"), async (req, res) => {
    const parsed = z
      .object({
        method: z.enum(["pix", "card"]),
        installments: z.number().int().min(1).max(12),
        idempotency_key: z.uuid(),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      throw new ValidationError({
        message: "Please check your payment option.",
      });
    await orders.quote(req.context.user.id!, String(req.query.id), parsed.data);
    return res
      .status(200)
      .json(await orders.view(req.context.user.id!, String(req.query.id)));
  })
  .handler(controller.errorHandlers);
