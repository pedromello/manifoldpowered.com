import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store, { storePublicationActionSchema } from "models/store";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("publish:store"), getHandler)
  .post(controller.canRequest("publish:store"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  preparePrivateResponse(res);
  const foundStore = await authorizedStore(req);
  const publication = await store.getPublicationState(foundStore.id);
  const output = authorization.filterOutput(
    req.context.user,
    "publish:store",
    publication,
  );

  return res.status(200).json(output);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  preparePrivateResponse(res);
  const result = storePublicationActionSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Choose either publish or unpublish and try again",
      context: result.error.issues,
    });
  }

  const foundStore = await authorizedStore(req);
  const publication = await store.changePublication(
    foundStore.id,
    req.context.user.id as string,
    result.data.action,
    result.data.expected_draft_revision,
  );
  const output = authorization.filterOutput(
    req.context.user,
    "publish:store",
    publication,
  );

  return res.status(200).json(output);
}

function preparePrivateResponse(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Vary", "Cookie");
}

async function authorizedStore(req: NextApiRequest) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "publish:store", foundStore)) {
    throw new ForbiddenError({
      message:
        "You do not have permission to publish or unpublish this Outlet.",
      action: "Ask the Outlet owner for the publish:store permission.",
    });
  }

  return foundStore;
}
