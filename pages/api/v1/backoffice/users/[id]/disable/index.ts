import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import user from "models/user";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { ForbiddenError, ValidationError } from "infra/errors";

const disableUserSchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("update:user:status:any"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const adminUser = req.context.user;

  if (adminUser.id === id) {
    throw new ForbiddenError({
      message: "You cannot disable your own account.",
      action: "Ask another admin to do this for you.",
    });
  }

  const result = disableUserSchema.safeParse(req.body ?? {});

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid request payload",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { user: disabledUser, previousFeatures } = await user.disable(
    id as string,
  );

  await auditLog.record({
    admin_user_id: adminUser.id as string,
    action: "user:disable",
    target_type: "user",
    target_id: disabledUser.id,
    reason: result.data.reason,
    metadata: { previous_features: previousFeatures },
  });

  const secureOutputValues = authorization.filterOutput(
    adminUser,
    "update:user:status:any",
    disabledUser,
  );

  return res.status(200).json(secureOutputValues);
}
