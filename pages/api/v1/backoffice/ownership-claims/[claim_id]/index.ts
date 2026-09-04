import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import gameOwnershipClaim, {
  decideOwnershipClaimSchema,
  ownershipClaimDecisionRouteQuerySchema,
} from "models/game_ownership_claim";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("decide:game_ownership_claim:any"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = ownershipClaimDecisionRouteQuerySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid ownership claim identifier.",
      action: "Check the claim identifier and try again.",
      context: query.error.issues,
    });
  }
  const parsed = decideOwnershipClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError({
      message: "Invalid ownership claim decision.",
      action: "Choose APPROVED or REJECTED and provide a rejection reason.",
      context: parsed.error.issues,
    });
  }

  const claim = await gameOwnershipClaim.decide({
    claimId: query.data.claim_id,
    adminUserId: req.context.user.id as string,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });
  return res.status(200).json({
    claim: authorization.filterOutput(
      req.context.user,
      "decide:game_ownership_claim:any",
      claim,
    ),
  });
}
