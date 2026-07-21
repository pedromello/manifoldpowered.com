import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { ValidationError } from "infra/errors";

interface AuditLogMetadata {
  previous_features?: string[];
}

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("update:user:status:any"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const adminUser = req.context.user;

  const targetUser = await user.findOneById(id as string);

  if (!user.isDisabled(targetUser)) {
    throw new ValidationError({
      message: "User is not currently disabled.",
      action: "Only disabled users can be enabled.",
    });
  }

  const { logs } = await auditLog.findAllPaginated({
    target_type: "user",
    target_id: targetUser.id,
    action: "user:disable",
    limit: 1,
  });

  const previousFeatures =
    (logs[0]?.metadata as AuditLogMetadata | undefined)?.previous_features ??
    authorization.ACTIVATED_USER_FEATURES;

  const enabledUser = await user.enable(targetUser.id, previousFeatures);

  await auditLog.record({
    admin_user_id: adminUser.id as string,
    action: "user:enable",
    target_type: "user",
    target_id: enabledUser.id,
  });

  const secureOutputValues = authorization.filterOutput(
    adminUser,
    "update:user:status:any",
    enabledUser,
  );

  return res.status(200).json(secureOutputValues);
}
