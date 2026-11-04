import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import auditLog from "models/audit_log";
import operations from "models/gift_card_operations";
import { assertSandbox } from "infra/runtime";
import { ValidationError } from "infra/errors";
import { requireSameOriginJson } from "infra/gift_card_operations_http";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(controller.canRequest("update:gift_card:any"), async (req, res) => {
    assertSandbox();
    requireSameOriginJson(req);
    const body = z
      .object({ code: z.string().min(1).max(100), enabled: z.boolean() })
      .strict()
      .safeParse(req.body);
    if (!body.success)
      throw new ValidationError({
        message: "Please check the product details.",
      });
    await operations.setProductEnabled(body.data.code, body.data.enabled);
    await auditLog.record({
      admin_user_id: req.context.user.id!,
      action: "gift_card:product-availability",
      target_type: "gift_card_product",
      target_id: body.data.code,
      metadata: { enabled: body.data.enabled },
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ enabled: body.data.enabled });
  })
  .handler(controller.errorHandlers);
