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
  const { studios, pagination } = await studio.findAllPaginated({
    owner_id: req.context.user.id,
  });

  const secureOutputValues = studios.map((studioItem) =>
    authorization.filterOutput(req.context.user, "create:studio", studioItem),
  );

  return res.status(200).json({
    studios: secureOutputValues,
    pagination,
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
