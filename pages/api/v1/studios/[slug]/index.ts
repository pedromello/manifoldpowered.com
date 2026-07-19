import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import studio from "models/studio";
import authorization from "models/authorization";
import { ForbiddenError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_studio"), getHandler)
  .patch(controller.canRequest("update:studio"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const foundStudio = await studio.findOneBySlug(slug as string);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:public_studio",
    foundStudio,
  );

  return res.status(200).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const studioUpdateDto = req.body;

  const userTryingToUpdate = req.context.user;
  const studioToUpdate = await studio.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToUpdate, "update:studio", studioToUpdate)) {
    throw new ForbiddenError({
      message: "You do not have permission to update this studio",
      action: "Verify if you are an administrator of this studio",
    });
  }

  const updatedStudio = await studio.update(studioToUpdate.id, studioUpdateDto);

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "update:studio",
    updatedStudio,
  );

  return res.status(200).json(secureOutputValues);
}
