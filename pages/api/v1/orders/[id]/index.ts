import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import orders, { enqueuePurchase } from "models/purchase_order";

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
      .json(await orders.view(req.context.user.id!, String(req.query.id))),
  )
  .post(controller.canRequest("create:library"), async (req, res) => {
    const parsed = z
      .object({ action: z.enum(["reconcile", "cancel"]) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      throw new ValidationError({
        message: "Please check your purchase details.",
      });
    const id = String(req.query.id);
    await orders.findOwn(req.context.user.id!, id);
    if (parsed.data.action === "cancel")
      await orders.cancel(req.context.user.id!, id);
    else await enqueuePurchase(id);
    return res.status(200).json(await orders.view(req.context.user.id!, id));
  })
  .handler(controller.errorHandlers);
