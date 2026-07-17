import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import storeCuration, { tagFilterSchema } from "models/store_curation";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("update:store"), getHandler)
  .post(controller.canRequest("update:store"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const userTryingToRead = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToRead, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to view this store's tag filters",
      action: "Verify if you are an administrator of this store",
    });
  }

  const filters = await storeCuration.listTagFilters(foundStore.id);

  const secureOutputValues = filters.map((filter) =>
    authorization.filterOutput(
      userTryingToRead,
      "read:store_tag_filter",
      filter,
    ),
  );

  return res.status(200).json(secureOutputValues);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const result = tagFilterSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToAdd = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToAdd, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this store's tag filters",
      action: "Verify if you are an administrator of this store",
    });
  }

  const createdFilter = await storeCuration.addTagFilter(
    foundStore.id,
    result.data.tag,
    result.data.mode,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToAdd,
    "read:store_tag_filter",
    createdFilter,
  );

  return res.status(201).json(secureOutputValues);
}
