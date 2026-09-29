import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store from "models/store";
import storeCuration, { bulkCurationSchema } from "models/store_curation";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("update:store"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = bulkCurationSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this Outlet's catalog.",
      action: "Ask the Outlet owner for catalog access.",
    });
  }

  const response = await storeCuration.applyBulkCuration(
    foundStore.id,
    result.data,
  );
  return res.status(200).json(response);
}
