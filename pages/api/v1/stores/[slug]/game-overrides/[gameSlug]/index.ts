import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import storeCuration, {
  gameOverrideVisibilitySchema,
} from "models/store_curation";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("update:store"), patchHandler)
  .delete(controller.canRequest("update:store"), deleteHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, gameSlug } = req.query;

  const result = gameOverrideVisibilitySchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToUpdate = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToUpdate, "update:store", foundStore)) {
    throw new ForbiddenError({
      message:
        "You do not have permission to manage this store's game overrides",
      action: "Verify if you are an administrator of this store",
    });
  }

  const updatedOverride = await storeCuration.updateGameOverrideVisibility(
    foundStore.id,
    gameSlug as string,
    result.data.visibility,
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "read:store_game_override",
    { ...updatedOverride, game_slug: gameSlug as string },
  );

  return res.status(200).json(secureOutputValues);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, gameSlug } = req.query;

  const userTryingToRemove = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToRemove, "update:store", foundStore)) {
    throw new ForbiddenError({
      message:
        "You do not have permission to manage this store's game overrides",
      action: "Verify if you are an administrator of this store",
    });
  }

  await storeCuration.removeGameOverride(foundStore.id, gameSlug as string);

  return res.status(200).json({ message: "Game override removed from store" });
}
