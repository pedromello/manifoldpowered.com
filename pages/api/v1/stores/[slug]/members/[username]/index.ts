import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { memberPermissionsSchema } from "models/store";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("manage:store_members"), patchHandler)
  .delete(controller.canRequest("manage:store_members"), deleteHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, username } = req.query;

  const result = memberPermissionsSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToUpdate = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (
    !authorization.can(userTryingToUpdate, "manage:store_members", foundStore)
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this store's members",
      action: "Verify if you are an administrator of this store",
    });
  }

  const updatedMember = await store.updateMemberPermissions(
    foundStore.id,
    username as string,
    result.data.permissions,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "manage:store_members",
    { ...updatedMember, username: username as string },
  );

  return res.status(200).json(secureOutputValues);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, username } = req.query;

  const userTryingToRemove = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (
    !authorization.can(userTryingToRemove, "manage:store_members", foundStore)
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this store's members",
      action: "Verify if you are an administrator of this store",
    });
  }

  await store.removeMember(foundStore.id, username as string);

  return res.status(200).json({ message: "Member removed from store" });
}
