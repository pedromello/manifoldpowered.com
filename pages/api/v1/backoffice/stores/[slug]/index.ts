import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import commercialTerms, { commissionRateSchema } from "models/commercial_terms";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:store:any"), getHandler)
  .patch(
    controller.canRequest("update:store_commission:any"),
    patchCommissionHandler,
  )
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const foundStore = await store.findOneBySlug(slug as string);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:store:any",
    foundStore,
  );

  return res.status(200).json(secureOutputValues);
}

// Commission is the only thing an admin may change about someone else's outlet,
// so this deliberately does not reuse the owner-facing update path — that one
// re-slugifies on a name change and has no business being reachable from here.
async function patchCommissionHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const result = commissionRateSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { slug } = req.query;

  // findOneBySlug throws NotFoundError, so an unknown outlet never reaches the
  // update or the audit log.
  const existingStore = await store.findOneBySlug(slug as string);

  const updatedStore = await commercialTerms.setCommissionRate(
    existingStore.id,
    result.data.commission_rate,
  );

  await auditLog.record({
    admin_user_id: req.context.user.id as string,
    action: "store:update_commission",
    target_type: "store",
    target_id: existingStore.id,
    // What someone earns is worth being able to reconstruct, so the previous
    // rate is snapshotted the same way user:disable snapshots features.
    metadata: {
      slug: existingStore.slug,
      previous: {
        commission_rate: existingStore.commission_rate?.toFixed(8) ?? null,
      },
      applied: {
        commission_rate: result.data.commission_rate?.toFixed(8) ?? null,
      },
    },
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "update:store_commission:any",
    updatedStore,
  );

  return res.status(200).json(secureOutputValues);
}
