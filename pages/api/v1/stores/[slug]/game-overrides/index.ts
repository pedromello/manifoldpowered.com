import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import storeCuration, { gameOverrideSchema } from "models/store_curation";
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
      message: "You do not have permission to view this store's game overrides",
      action: "Verify if you are an administrator of this store",
    });
  }

  const overrides = await storeCuration.listGameOverridesWithSlugs(
    foundStore.id,
  );

  const secureOutputValues = overrides.map((override) =>
    authorization.filterOutput(
      userTryingToRead,
      "read:store_game_override",
      override,
    ),
  );

  return res.status(200).json(secureOutputValues);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const result = gameOverrideSchema.safeParse(req.body);

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
      message:
        "You do not have permission to manage this store's game overrides",
      action: "Verify if you are an administrator of this store",
    });
  }

  const createdOverride = await storeCuration.addGameOverride(
    foundStore.id,
    result.data.game_slug,
    result.data.visibility,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToAdd,
    "read:store_game_override",
    { ...createdOverride, game_slug: result.data.game_slug },
  );

  return res.status(201).json(secureOutputValues);
}
