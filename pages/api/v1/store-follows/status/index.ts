import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import authorization from "models/authorization";
import storeFollow, { storeFollowQuerySchema } from "models/store_follow";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:store_follow_status"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = storeFollowQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more query parameters are invalid",
      action: "Provide a valid store_slug and try again",
      context: result.error.issues,
    });
  }

  const followStatus = await storeFollow.status(
    req.context.user.id,
    result.data.store_slug,
  );
  const output = authorization.filterOutput(
    req.context.user,
    "read:store_follow_status",
    followStatus,
  );

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json(output);
}
