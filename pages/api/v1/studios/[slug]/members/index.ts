import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import studio, { memberPermissionsSchema } from "models/studio";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";
import { z } from "zod";

const addMemberSchema = memberPermissionsSchema.extend({
  username: z.string().min(1),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("manage:studio_members"), getHandler)
  .post(controller.canRequest("manage:studio_members"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const userTryingToRead = req.context.user;
  const foundStudio = await studio.findOneBySlugWithMembers(slug as string);

  if (
    !authorization.can(userTryingToRead, "manage:studio_members", foundStudio)
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to view this studio's members",
      action: "Verify if you are an administrator of this studio",
    });
  }

  const members = await studio.listMembersWithUsernames(foundStudio.id);

  const secureOutputValues = members.map((member) =>
    authorization.filterOutput(
      userTryingToRead,
      "manage:studio_members",
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
  const foundStudio = await studio.findOneBySlugWithMembers(slug as string);

  if (
    !authorization.can(userTryingToAdd, "manage:studio_members", foundStudio)
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this studio's members",
      action: "Verify if you are an administrator of this studio",
    });
  }

  const createdMember = await studio.addMember(
    foundStudio.id,
    result.data.username,
    result.data.permissions,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToAdd,
    "manage:studio_members",
    { ...createdMember, username: result.data.username },
  );

  return res.status(201).json(secureOutputValues);
}
