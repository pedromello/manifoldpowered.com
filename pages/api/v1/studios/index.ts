import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import studio, { studioSchema, StudioCreateDto } from "models/studio";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("create:studio"), getHandler)
  .post(controller.canRequest("create:studio"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  // "My Studios": studios the user owns OR is a member of (see
  // studio.findAllForUser). The full set is returned unpaginated; the
  // pagination envelope is kept for response-shape compatibility.
  const studios = await studio.findAllForUser(req.context.user.id);

  const secureOutputValues = studios.map((studioItem) =>
    authorization.filterOutput(req.context.user, "create:studio", studioItem),
  );

  return res.status(200).json({
    studios: secureOutputValues,
    pagination: {
      page: 1,
      limit: studios.length,
      total: studios.length,
      pages: studios.length > 0 ? 1 : 0,
    },
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = studioSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const studioData: StudioCreateDto = {
    ...result.data,
    owner_id: req.context.user.id,
  };

  const createdStudio = await studio.create(studioData);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "create:studio",
    createdStudio,
  );

  return res.status(201).json(secureOutputValues);
}
