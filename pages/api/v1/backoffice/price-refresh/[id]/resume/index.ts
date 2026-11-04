import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { ServiceError, ValidationError } from "infra/errors";
import {
  dispatchPriceRefresh,
  priceExecutorConfigured,
} from "infra/price_refresh_dispatch";
import { resumeRun, runSummary } from "models/price_refresh";
import auditLog from "models/audit_log";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    return next();
  })
  .post(controller.canRequest("update:game:status:any"), async (req, res) => {
    const id = z.uuid().safeParse(req.query.id);
    const body = z
      .object({ retry_failed: z.boolean().default(false) })
      .strict()
      .safeParse(req.body ?? {});
    if (!id.success || !body.success)
      throw new ValidationError({ message: "Invalid price refresh request" });
    if (!priceExecutorConfigured())
      throw new ServiceError({ message: "Price executor is not configured" });
    const { run, resumed } = await resumeRun(id.data, body.data.retry_failed);
    if (resumed) {
      await auditLog.record({
        admin_user_id: req.context.user.id,
        action: "price_refresh:resume",
        target_type: "price_refresh",
        target_id: run.id,
        metadata: { retry_failed: body.data.retry_failed },
      });
      await dispatchPriceRefresh(run.id);
    }
    return res.status(resumed ? 202 : 200).json(await runSummary(run.id));
  })
  .handler(controller.errorHandlers);
