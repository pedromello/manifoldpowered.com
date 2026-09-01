import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { ForbiddenError } from "infra/errors";
import authorization from "models/authorization";
import store, { parseStoreDraftIfMatch } from "models/store";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("publish:store"), publishHandler)
  .delete(controller.canRequest("publish:store"), unpublishHandler)
  .handler(controller.errorHandlers);

async function publishHandler(req: NextApiRequest, res: NextApiResponse) {
  const target = await loadAuthorizedStore(req);
  const expectedDraftRevision = parseStoreDraftIfMatch(req.headers["if-match"]);
  const publishedStore = await store.publish(
    target.id,
    req.context.user.id,
    expectedDraftRevision,
  );

  setPrivateManagementHeaders(res, publishedStore.draft_revision);
  return res
    .status(200)
    .json(
      authorization.filterOutput(
        req.context.user,
        "publish:store",
        publishedStore,
      ),
    );
}

async function unpublishHandler(req: NextApiRequest, res: NextApiResponse) {
  const target = await loadAuthorizedStore(req);
  const expectedDraftRevision = parseStoreDraftIfMatch(req.headers["if-match"]);
  const unpublishedStore = await store.unpublish(
    target.id,
    expectedDraftRevision,
  );

  setPrivateManagementHeaders(res, unpublishedStore.draft_revision);
  return res
    .status(200)
    .json(
      authorization.filterOutput(
        req.context.user,
        "publish:store",
        unpublishedStore,
      ),
    );
}

async function loadAuthorizedStore(req: NextApiRequest) {
  const target = await store.findOneBySlugWithRevisionAndMembers(
    req.query.slug as string,
  );

  if (!authorization.can(req.context.user, "publish:store", target)) {
    throw new ForbiddenError({
      message: "You do not have permission to publish this Outlet",
      action: "Only the Outlet owner or a platform administrator can do this",
    });
  }

  return target;
}

function setPrivateManagementHeaders(
  res: NextApiResponse,
  draftRevision: number,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("ETag", `"${draftRevision}"`);
}
