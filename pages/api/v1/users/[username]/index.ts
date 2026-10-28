import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import user from "models/user";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

const profileUpdate = z
  .object({
    username: z.string().min(1).max(30).optional(),
    email: z.email().optional(),
    password: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

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

  const userTryingToPatch = req.context.user;
  const userToPatch = await user.findOneByUsername(username as string);

  if (!authorization.can(userTryingToPatch, "update:user", userToPatch)) {
    throw new ForbiddenError({
      message: "You do not have permission to update another user",
      action: "Verify your user has authorization to update other users",
    });
  }

  // Permission grants and mailbox proof are exclusively server-managed. Never
  // forward arbitrary profile JSON to Prisma, including internal identifiers.
  const parsed = profileUpdate.safeParse(req.body);
  if (!parsed.success)
    throw new ValidationError({
      message: "Please check your profile details.",
    });

  const updatedUser = await user.updateByUsername(
    username as string,
    parsed.data,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:user",
    updatedUser,
  );

  return res.status(200).json(secureOutputValues);
}
