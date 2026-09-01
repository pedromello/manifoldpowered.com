import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store, { storePublicationActionSchema } from "models/store";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.requireAuthentication, getHandler)
  .post(controller.canRequest("publish:store"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  preparePrivateResponse(res);
  const foundStore = await authorizedStore(req, "read");
  const publication = await store.getPublicationState(foundStore.id);
  const output = authorization.filterOutput(
    req.context.user,
    "publish:store",
    publication,
  );

  return res.status(200).json(withCapabilities(req, foundStore, output));
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

  const foundStore = await authorizedStore(req, "publish");
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

  return res.status(200).json(withCapabilities(req, foundStore, output));
}

function withCapabilities(
  req: NextApiRequest,
  foundStore: Awaited<ReturnType<typeof store.findOneBySlugWithMembers>>,
  output: Record<string, unknown>,
) {
  const canPublish = authorization.can(
    req.context.user,
    "publish:store",
    foundStore,
  );
  return {
    ...output,
    capabilities: {
      edit: authorization.can(req.context.user, "update:store", foundStore),
      publish: canPublish,
      unpublish: canPublish,
    },
  };
}

function preparePrivateResponse(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Vary", "Cookie");
}

async function authorizedStore(
  req: NextApiRequest,
  access: "read" | "publish",
) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  const authorized =
    access === "read"
      ? authorization.canReadStoreDraft(req.context.user, foundStore)
      : authorization.can(req.context.user, "publish:store", foundStore);
  if (!authorized) {
    throw new ForbiddenError({
      message:
        access === "read"
          ? "You do not have permission to inspect this Outlet's draft."
          : "You do not have permission to publish or unpublish this Outlet.",
      action:
        access === "read"
          ? "Ask the Outlet owner for an editing or publication permission."
          : "Ask the Outlet owner for the publish:store permission.",
    });
  }

  return foundStore;
}
