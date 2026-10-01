import { createRouter } from "next-connect";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import giftCardOrder, { giftCardOrderOutput } from "models/gift_card_order";

const actionSchema = z
  .object({ action: z.enum(["checkout", "cancel", "retry_issuance"]) })
  .strict();

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!z.uuid().safeParse(req.query.id).success)
      throw new ValidationError({ message: "Invalid gift card order ID." });
    return next();
  })
  .get(controller.canRequest("read:library"), async (req, res) => {
    res
      .status(200)
      .json(
        giftCardOrderOutput(
          await giftCardOrder.findOwn(
            req.context.user.id!,
            req.query.id as string,
          ),
        ),
      );
  })
  .post(controller.canRequest("create:library"), async (req, res) => {
    const body = actionSchema.safeParse(req.body);
    if (!body.success)
      throw new ValidationError({ message: "Invalid gift card order action." });
    const userId = req.context.user.id!;
    const id = req.query.id as string;
    const order =
      body.data.action === "checkout"
        ? await giftCardOrder.checkout(userId, id)
        : body.data.action === "cancel"
          ? await giftCardOrder.cancel(userId, id)
          : await giftCardOrder.retryIssuance(userId, id);
    res.status(200).json(giftCardOrderOutput(order));
  })
  .handler(controller.errorHandlers);
