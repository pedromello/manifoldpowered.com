import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import gameOwnershipClaim, {
  ownershipClaimAdminQuerySchema,
} from "models/game_ownership_claim";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:game_ownership_claim:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsed = ownershipClaimAdminQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError({
      message: "Invalid ownership claim query parameters.",
      action: "Check the filters and pagination values.",
      context: parsed.error.issues,
    });
  }

  const { claims, pagination } = await gameOwnershipClaim.findAllPaginatedAdmin(
    parsed.data,
  );
  return res.status(200).json({
    claims: claims.map((claim) =>
      authorization.filterOutput(
        req.context.user,
        "read:game_ownership_claim:any",
        claim,
      ),
    ),
    pagination,
  });
}
