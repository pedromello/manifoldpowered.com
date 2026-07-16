import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import storeCuration, { tagFilterModeSchema } from "models/store_curation";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("update:store"), patchHandler)
  .delete(controller.canRequest("update:store"), deleteHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, tag } = req.query;

  const result = tagFilterModeSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToUpdate = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToUpdate, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this store's tag filters",
      action: "Verify if you are an administrator of this store",
    });
  }

  const updatedFilter = await storeCuration.updateTagFilterMode(
    foundStore.id,
    tag as string,
    result.data.mode,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "read:store_tag_filter",
    updatedFilter,
  );

  return res.status(200).json(secureOutputValues);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, tag } = req.query;

  const userTryingToRemove = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToRemove, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this store's tag filters",
      action: "Verify if you are an administrator of this store",
    });
  }

  await storeCuration.removeTagFilter(foundStore.id, tag as string);

  return res.status(200).json({ message: "Tag filter removed from store" });
}
