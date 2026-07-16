import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";
import { ForbiddenError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .patch(controller.canRequest("update:store"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const foundStore = await store.findOneBySlug(slug as string);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:public_store",
    foundStore,
  );

  return res.status(200).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const storeUpdateDto = req.body;

  const userTryingToUpdate = req.context.user;
  const storeToUpdate = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToUpdate, "update:store", storeToUpdate)) {
    throw new ForbiddenError({
      message: "You do not have permission to update this store",
      action: "Verify if you are an administrator of this store",
    });
  }

  const updatedStore = await store.update(storeToUpdate.id, storeUpdateDto);

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "update:store",
    updatedStore,
  );

  return res.status(200).json(secureOutputValues);
}
