import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import authorization from "models/authorization";
import storeFollow, { storeFollowBodySchema } from "models/store_follow";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(
    controller.requireAuthentication,
    controller.canRequest("read:store_follow"),
    getHandler,
  )
  .post(
    controller.requireAuthentication,
    controller.canRequest("create:store_follow"),
    postHandler,
  )
  .delete(
    controller.requireAuthentication,
    controller.canRequest("delete:store_follow"),
    deleteHandler,
  )
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const stores = await storeFollow.listForUser(req.context.user.id);
  const secureStores = stores.map((store) =>
    authorization.filterOutput(req.context.user, "read:public_store", store),
  );

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ stores: secureStores });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = storeFollowBodySchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Provide a valid store_slug and try again",
      context: result.error.issues,
    });
  }

  await storeFollow.follow(req.context.user.id, result.data.store_slug);
  const output = authorization.filterOutput(
    req.context.user,
    "create:store_follow",
    { is_followed: true },
  );

  return res.status(201).json(output);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = storeFollowBodySchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Provide a valid store_slug and try again",
      context: result.error.issues,
    });
  }

  await storeFollow.unfollow(req.context.user.id, result.data.store_slug);
  const output = authorization.filterOutput(
    req.context.user,
    "delete:store_follow",
    { is_followed: false },
  );

  return res.status(200).json(output);
}
