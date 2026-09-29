import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store from "models/store";
import storeCuration, { creatorSelectionSchema } from "models/store_curation";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("update:store"), postHandler)
  .put(controller.canRequest("update:store"), putHandler)
  .handler(controller.errorHandlers);

async function putHandler(req: NextApiRequest, res: NextApiResponse) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to curate this Outlet.",
      action: "Ask the Outlet owner for editing access.",
    });
  }

  const result = creatorSelectionSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError({
      message: "The Outlet selection is invalid.",
      action: "Choose a focus or at least five games and try again.",
      context: result.error.issues,
    });
  }

  const selection = await storeCuration.replaceCreatorSelection(
    foundStore.id,
    result.data,
  );
  return res
    .status(200)
    .json(
      authorization.filterOutput(req.context.user, "update:store", selection),
    );
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to preview this Outlet selection.",
      action: "Ask the Outlet owner for editing access.",
    });
  }
  const result = creatorSelectionSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError({
      message: "The Outlet selection preview is invalid.",
      action: "Choose a focus or at least five games and try again.",
      context: result.error.issues,
    });
  }
  const preview = await storeCuration.previewCreatorSelection(
    foundStore.id,
    result.data,
  );
  return res
    .status(200)
    .json(
      authorization.filterOutput(req.context.user, "update:store", preview),
    );
}
