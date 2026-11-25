import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "generated/prisma/client";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { assertSandbox } from "infra/runtime";
import { ValidationError } from "infra/errors";
import {
  operationActionSchema,
  operationOrderIdSchema,
  requireSameOriginJson,
  runGiftCardOperation,
} from "infra/gift_card_operations_http";

export const config = { maxDuration: 60 };

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(controller.canRequest("update:gift_card:any"), async (req, res) => {
    assertSandbox();
    requireSameOriginJson(req);
    const action = operationActionSchema.safeParse(req.query.action);
    if (!action.success)
      throw new ValidationError({ message: "Unknown operation." });
    res.setHeader("Cache-Control", "no-store");
    const targetOrder = operationOrderIdSchema.safeParse(req.body?.order_id);
    const targeted =
      targetOrder.success &&
      (action.data === "track-deliveries" ||
        action.data === "submit-paid-orders");
    const target = targeted
      ? { target_type: "gift_card_order", target_id: targetOrder.data }
      : { target_type: "system", target_id: "gift_cards" };
    let report;
    try {
      report = await runGiftCardOperation(action.data, req.body);
    } catch (error) {
      await auditLog.record({
        admin_user_id: req.context.user.id!,
        action: `gift_card:${action.data}`,
        ...target,
        metadata: { failed: true },
      });
      throw error;
    }
    const output = authorization.filterOutput(
      req.context.user,
      "update:gift_card:any",
      report,
    );
    await auditLog.record({
      admin_user_id: req.context.user.id!,
      action: `gift_card:${action.data}`,
      ...target,
      metadata: {
        ...(output as Prisma.InputJsonObject),
        ...(targeted && action.data === "track-deliveries"
          ? { early_tracking: req.body.force === true }
          : {}),
      },
    });
    return res.status(200).json(output);
  })
  .handler(controller.errorHandlers);
