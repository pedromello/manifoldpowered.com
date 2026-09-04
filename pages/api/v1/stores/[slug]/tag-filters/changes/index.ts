import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store from "models/store";
import storeCuration, { tagRuleChangeSchema } from "models/store_curation";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("update:store"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsed = tagRuleChangeSchema.safeParse(req.body);
  if (!parsed.success)
    throw new ValidationError({ context: parsed.error.issues });
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({ message: "You cannot curate this Outlet." });
  }
  return res
    .status(200)
    .json(await storeCuration.applyTagRuleChange(foundStore.id, parsed.data));
}
