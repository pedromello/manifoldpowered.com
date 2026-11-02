import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { prisma } from "infra/database";
import { ServiceError, ValidationError } from "infra/errors";
import {
  priceExecutorConfigured,
  dispatchPriceRefresh,
} from "infra/price_refresh_dispatch";
import { createRun, runSummary } from "models/price_refresh";
import auditLog from "models/audit_log";

const bodySchema = z
  .object({
    provider: z
      .enum(["ALL", "STEAM", "NINTENDO", "PLAYSTATION"])
      .default("ALL"),
  })
  .strict();
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    return next();
  })
  .get(controller.canRequest("read:game:any"), async (_req, res) => {
    const runs = await prisma.priceRefreshRun.findMany({
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true },
    });
    return res.status(200).json({
      configured: priceExecutorConfigured(),
      runs: await Promise.all(runs.map((run) => runSummary(run.id))),
    });
  })
  .post(controller.canRequest("update:game:status:any"), async (req, res) => {
    const input = bodySchema.safeParse(req.body ?? {});
    if (!input.success)
      throw new ValidationError({ message: "Invalid price refresh request" });
    if (!priceExecutorConfigured())
      throw new ServiceError({ message: "Price executor is not configured" });
    const { run, created } = await createRun(
      input.data.provider,
      req.context.user.id,
    );
    if (created) {
      await auditLog.record({
        admin_user_id: req.context.user.id,
        action: "price_refresh:start",
        target_type: "price_refresh",
        target_id: run.id,
        metadata: { provider: input.data.provider },
      });
      await dispatchPriceRefresh(run.id);
    }
    return res.status(created ? 202 : 200).json(await runSummary(run.id));
  })
  .handler(controller.errorHandlers);
