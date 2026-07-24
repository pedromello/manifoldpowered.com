import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { storeSchema, StoreCreateDto } from "models/store";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("create:store"), getHandler)
  .post(controller.canRequest("create:store"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  // "My Outlets": stores the user owns OR is a member of (see
  // store.findAllForUser). The full set is returned unpaginated; the
  // pagination envelope is kept for response-shape compatibility.
  const stores = await store.findAllForUser(req.context.user.id);

  const secureOutputValues = stores.map((storeItem) =>
    authorization.filterOutput(req.context.user, "create:store", storeItem),
  );

  return res.status(200).json({
    stores: secureOutputValues,
    pagination: {
      page: 1,
      limit: stores.length,
      total: stores.length,
      pages: stores.length > 0 ? 1 : 0,
    },
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = storeSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const storeData: StoreCreateDto = {
    ...result.data,
    owner_id: req.context.user.id,
  };

  const createdStore = await store.create(storeData);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "create:store",
    createdStore,
  );

  return res.status(201).json(secureOutputValues);
}
