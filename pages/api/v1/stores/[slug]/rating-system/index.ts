import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store from "models/store";
import { applyRatingSystem } from "models/store_rating_system";
import { ratingSystemInputSchema } from "contracts/outlet-rating";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .put(controller.canRequest("update:store"), putHandler)
  .handler(controller.errorHandlers);

async function putHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = ratingSystemInputSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError({
      message: "The rating system request is invalid.",
      action: "Select a rating scale and check the conversion mapping.",
      context: parsed.error.issues,
    });
  }
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({
      message:
        "You do not have permission to change this Outlet's rating system.",
      action: "Ask the Outlet owner for editing access.",
    });
  }
  const result = await applyRatingSystem(
    foundStore.id,
    req.context.user.id,
    parsed.data,
  );
  return res
    .status(200)
    .json(authorization.filterOutput(req.context.user, "update:store", result));
}
