import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import controller from "infra/controller";
import featureBackfill from "models/feature_backfill";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { ValidationError } from "infra/errors";

const backfillRequestSchema = z
  .object({
    scope: z.enum(["all", "home_admins"]).default("all"),
  })
  .strict();

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("update:user:features:any"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = backfillRequestSchema.safeParse(req.body ?? {});

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid feature reconciliation scope.",
      action: "Use an empty body or scope home_admins.",
      context: result.error.issues,
    });
  }

  const adminUser = req.context.user;
  const homeOnly = result.data.scope === "home_admins";
  const report = homeOnly
    ? await featureBackfill.reconcileHomeAdmins()
    : await featureBackfill.reconcileAll();

  await auditLog.record({
    admin_user_id: adminUser.id as string,
    action: homeOnly ? "feature_backfill:home_admins" : "feature_backfill:run",
    target_type: "system",
    target_id: "feature_backfill",
    metadata: {
      ...report,
      scope: result.data.scope,
    } as unknown as Prisma.InputJsonValue,
  });

  const secureOutputValues = authorization.filterOutput(
    adminUser,
    "update:user:features:any",
    report,
  );

  return res.status(200).json(secureOutputValues);
}
