import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { memberPermissionsSchema } from "models/store";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";
import { z } from "zod";

const addMemberSchema = memberPermissionsSchema.extend({
  username: z.string().min(1),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("manage:store_members"), getHandler)
  .post(controller.canRequest("manage:store_members"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const userTryingToRead = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (
    !authorization.can(userTryingToRead, "manage:store_members", foundStore)
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to view this store's members",
      action: "Verify if you are an administrator of this store",
    });
  }

  const members = await store.listMembersWithUsernames(foundStore.id);

  const secureOutputValues = members.map((member) =>
    authorization.filterOutput(
      userTryingToRead,
      "manage:store_members",
      member,
    ),
  );

  return res.status(200).json(secureOutputValues);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const result = addMemberSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToAdd = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToAdd, "manage:store_members", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this store's members",
      action: "Verify if you are an administrator of this store",
    });
  }

  const createdMember = await store.addMember(
    foundStore.id,
    result.data.username,
    result.data.permissions,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToAdd,
    "manage:store_members",
    { ...createdMember, username: result.data.username },
  );

  return res.status(201).json(secureOutputValues);
}
