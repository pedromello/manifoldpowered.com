import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { assertSandbox } from "infra/runtime";
import { ForbiddenError, ValidationError } from "infra/errors";
import {
  operationActionSchema,
  runGiftCardOperation,
} from "infra/gift_card_operations_http";

export const config = { maxDuration: 60 };

export default createRouter<NextApiRequest, NextApiResponse>()
  .get(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const received = req.headers.authorization;
    const expected = `Bearer ${secret}`;
    if (
      !secret ||
      secret.length < 32 ||
      typeof received !== "string" ||
      Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      throw new ForbiddenError({ message: "This request is not permitted." });
    assertSandbox();
    const action = operationActionSchema.safeParse(req.query.action);
    if (
      !action.success ||
      Object.keys(req.query).some((key) => key !== "action")
    )
      throw new ValidationError({ message: "Unknown operation." });
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(200)
      .json(await runGiftCardOperation(action.data, {}, { cron: true }));
  })
  .handler(controller.errorHandlers);
