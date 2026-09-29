import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError } from "infra/errors";
import authorization from "models/authorization";
import store from "models/store";
import { managementShellOutput } from "models/store_management_shell";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use((_req, res, next) => {
    preparePrivateResponse(res);
    return next();
  })
  .get(controller.requireAuthentication, getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  const capabilities = authorization.storeManagementCapabilities(
    req.context.user,
    foundStore,
  );

  if (!Object.values(capabilities).some(Boolean)) {
    throw new ForbiddenError({
      message: "You do not have permission to manage this Outlet.",
      action: "Ask the Outlet owner for a management permission.",
    });
  }

  // This is intentionally not a filtered Store draft. The management shell is
  // shared with financial-only delegates and must never disclose brand copy,
  // catalog choices, readiness, revisions, presentation or snapshots.
  return res.status(200).json(managementShellOutput(foundStore, capabilities));
}

function preparePrivateResponse(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Vary", "Cookie");
}
