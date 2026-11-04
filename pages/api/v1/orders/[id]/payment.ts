import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import { isIP } from "node:net";
import { z } from "zod";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import orders from "models/purchase_order";
import { prisma } from "infra/database";

const buyer = z
  .object({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    phone: z.string().regex(/^\d{10,11}$/),
    document_number: z.string().regex(/^\d{11}$|^\d{14}$/),
    ip: z.string().refine((value) => Boolean(isIP(value))),
    holder_name: z.string().trim().min(1).max(100).optional(),
    holder_document_number: z
      .string()
      .regex(/^\d{11}$|^\d{14}$/)
      .optional(),
  })
  .strict();
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(controller.canRequest("create:library"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!z.uuid().safeParse(req.query.id).success)
      throw new ValidationError({ message: "Order not found." });
    const parsed = z
      .object({
        attempt_id: z.string().min(1).max(100),
        expected_total_minor: z.number().int().positive(),
        buyer: buyer.optional(),
        card_token: z.string().min(1).max(512).optional(),
      })
      .strict()
      .safeParse(req.body);
    // Deliberately do not attach validation input or cause: it may contain a token.
    if (!parsed.success)
      throw new ValidationError({
        message: "Please check your purchase details.",
      });
    const order = await orders.findOwn(
      req.context.user.id!,
      String(req.query.id),
    );
    if (order.payment_provider === "appmax" && !parsed.data.buyer)
      throw new ValidationError({
        message: "Please check your purchase details.",
      });
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: req.context.user.id! },
      select: { email: true },
    });
    const details = parsed.data.buyer ?? {
      first_name: "",
      last_name: "",
      phone: "",
      document_number: "",
      ip: "",
    };
    return res.status(200).json(
      await orders.submit(req.context.user.id!, order.id, {
        ...parsed.data,
        buyer: { ...details, email: account.email },
      }),
    );
  })
  .handler(controller.errorHandlers);
