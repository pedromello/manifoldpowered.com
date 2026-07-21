import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import studio, { studioAdminQuerySchema } from "models/studio";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:studio:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = studioAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { studios, pagination } = await studio.findAllPaginated(result.data);

  const secureOutputValues = studios.map((studioItem) =>
    authorization.filterOutput(req.context.user, "read:studio:any", studioItem),
  );

  return res.status(200).json({
    studios: secureOutputValues,
    pagination,
  });
}
