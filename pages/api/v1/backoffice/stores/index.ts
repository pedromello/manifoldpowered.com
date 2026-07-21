import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { storeAdminQuerySchema } from "models/store";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:store:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = storeAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { stores, pagination } = await store.findAllPaginated(result.data);

  const secureOutputValues = stores.map((storeItem) =>
    authorization.filterOutput(req.context.user, "read:store:any", storeItem),
  );

  return res.status(200).json({
    stores: secureOutputValues,
    pagination,
  });
}
