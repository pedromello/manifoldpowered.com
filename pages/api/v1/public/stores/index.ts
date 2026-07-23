import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { storeAdminQuerySchema } from "models/store";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = storeAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more query parameters are invalid",
      action: "Check the query parameters and try again",
      context: result.error.issues,
    });
  }

  const { page, limit, q } = result.data;

  // No owner_id filter: this returns every outlet, unlike the owner-scoped
  // GET /api/v1/stores. Powers the public "Discover other Outlets" browse.
  const { stores, pagination } = await store.findAllPaginated({
    page,
    limit,
    q,
  });

  const secureOutputValues = stores.map((storeItem) =>
    authorization.filterOutput(
      req.context.user,
      "read:public_store",
      storeItem,
    ),
  );

  return res.status(200).json({ stores: secureOutputValues, pagination });
}
