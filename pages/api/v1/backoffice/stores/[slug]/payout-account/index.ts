import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import payoutAccount from "models/payout_account";
import { ValidationError } from "infra/errors";

// Whether an outlet has cleared verification and may be paid.
//
// Split from the owner-facing payout-account endpoint on purpose: an outlet
// says where its money goes, the platform says whether it may go there at all.
// Neither side can do the other's half, which is what makes payouts_enabled a
// gate rather than a field.
//
// Nothing else writes this today. Once a provider adapter exists its status
// sync calls the same model function, and this endpoint stays as the manual
// override for the cases a provider gets wrong.
const payoutStatusSchema = z.object({
  payouts_enabled: z.boolean(),
  reason: z.string().min(1).max(1000).optional(),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(
    controller.canRequest("update:payout_account:status:any"),
    patchHandler,
  )
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const adminUser = req.context.user;

  const result = payoutStatusSchema.safeParse(req.body ?? {});

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid request payload",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  // No resource-scoped can() check here, unlike the owner-facing endpoint:
  // update:payout_account:status:any is global by construction, the same as
  // every other backoffice feature.
  const foundStore = await store.findOneBySlug(slug as string);

  const existingAccount = await payoutAccount.findOneByStoreId(foundStore.id);

  const updatedAccount = await payoutAccount.setProviderState(foundStore.id, {
    payouts_enabled: result.data.payouts_enabled,
  });

  await auditLog.record({
    admin_user_id: adminUser.id as string,
    action: "payout_account:status",
    target_type: "payout_account",
    target_id: updatedAccount.id,
    reason: result.data.reason,
    // "Why is this outlet payable" is the question someone asks of this trail
    // later, so the answer has to survive the next change to the row.
    metadata: {
      store_id: foundStore.id,
      store_slug: foundStore.slug,
      previous: { payouts_enabled: existingAccount.payouts_enabled },
      applied: { payouts_enabled: updatedAccount.payouts_enabled },
    },
  });

  const secureOutputValues = authorization.filterOutput(
    adminUser,
    "update:payout_account:status:any",
    updatedAccount,
  );

  return res.status(200).json(secureOutputValues);
}
