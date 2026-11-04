import { createRouter } from "next-connect";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { prisma } from "infra/database";
import { ConflictError, NotFoundError, ValidationError } from "infra/errors";
import { encryptGiftRecipient } from "infra/gift_card_recipient";
import { recipientDocumentRequired } from "infra/gift_card_api";
import { requireVerifiedAccountEmail } from "models/user_email_verification";
import purchases from "models/purchase_order";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(controller.canRequest("create:library"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(160),
        document: z
          .string()
          .regex(/^\d{11}$|^\d{14}$/)
          .optional(),
        confirmed: z.literal(true),
      })
      .strict()
      .safeParse(req.body);
    if (
      !z.uuid().safeParse(req.query.id).success ||
      !parsed.success ||
      (recipientDocumentRequired() && !parsed.data.document)
    )
      throw new ValidationError({
        message: "Please check your delivery details.",
      });
    const id = String(req.query.id),
      userId = req.context.user.id!;
    const own = await purchases.findOwn(userId, id);
    if (!own.gift_card_order_id)
      throw new NotFoundError({ message: "Gift card order not found." });
    const ciphertext = encryptGiftRecipient(
      {
        name: parsed.data.name,
        ...(parsed.data.document ? { document: parsed.data.document } : {}),
      },
      own.gift_card_order_id,
    );
    try {
      await prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<
          { paid_at: Date | null; payment_status: string }[]
        >`SELECT paid_at,payment_status FROM purchase_orders WHERE id=${id} AND user_id=${userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM gift_card_orders WHERE id=${own.gift_card_order_id} FOR UPDATE`;
        const gift = await tx.giftCardOrder.findUniqueOrThrow({
          where: { id: own.gift_card_order_id! },
        });
        const attempt = await tx.purchasePaymentAttempt.findFirst({
          where: { order_id: id, submission_started_at: { not: null } },
        });
        if (
          !order ||
          order.paid_at ||
          !["UNPAID", "FAILED"].includes(order.payment_status) ||
          attempt ||
          gift.delivery_channel !== "EMAIL" ||
          gift.issuance_started_at
        )
          throw new ConflictError({
            message:
              "Delivery details cannot be changed after payment has started.",
          });
        const verified = await requireVerifiedAccountEmail(tx, userId);
        if (verified !== gift.recipient_email)
          throw new ConflictError({
            message:
              "Your account email has changed. Cancel this unpaid order and start a new purchase.",
          });
        await tx.giftCardOrder.update({
          where: { id: gift.id },
          data: {
            recipient_data: ciphertext,
            recipient_confirmed_at: new Date(),
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictError || error instanceof NotFoundError)
        throw error;
      throw new ValidationError({
        message: "Your delivery details could not be saved.",
      });
    }
    return res.status(200).json(await purchases.view(userId, id));
  })
  .handler(controller.errorHandlers);
