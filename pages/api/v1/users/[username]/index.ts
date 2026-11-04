import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";
import { userUpdateSchema } from "contracts/creator-requests";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(getHandler)
  .patch(controller.canRequest("update:user"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query;
  const userTryingToGet = req.context.user;

  const userFound = await user.findOneByUsername(username as string);

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:user",
    userFound,
  );

  return res.status(200).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query;
  const input = userUpdateSchema.safeParse(req.body);
  if (!input.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Only username, email and password can be updated here",
    });
  }

  const userTryingToPatch = req.context.user;
  const userToPatch = await user.findOneByUsername(username as string);

  if (!authorization.can(userTryingToPatch, "update:user", userToPatch)) {
    throw new ForbiddenError({
      message: "You do not have permission to update another user",
      action: "Verify your user has authorization to update other users",
    });
  }

  const updatedUser = await user.updateByUsername(
    username as string,
    input.data,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:user",
    updatedUser,
  );

  return res.status(200).json(secureOutputValues);
}
