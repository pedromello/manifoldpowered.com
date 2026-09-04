import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { parseStoreDraftIfMatch } from "models/store";
import authorization from "models/authorization";
import { ForbiddenError } from "infra/errors";
import { prepareStorefrontPreview } from "lib/storefront-preview";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .patch(controller.canRequest("update:store"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const preview = prepareStorefrontPreview(req, res);
  const foundStore = await store.findOneForStorefront(slug as string, {
    preview,
    user: req.context.user,
  });
  if (preview) {
    res.setHeader("ETag", `\"${foundStore.draft_revision}\"`);
  }

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    preview ? "update:store" : "read:public_store",
    foundStore,
  );

  return sendJsonWithoutReplacingEtag(res, secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const storeUpdateDto = req.body;

  const userTryingToUpdate = req.context.user;
  const storeToUpdate = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToUpdate, "update:store", storeToUpdate)) {
    throw new ForbiddenError({
      message: "You do not have permission to update this store",
      action: "Verify if you are an administrator of this store",
    });
  }

  const expectedDraftRevision = parseStoreDraftIfMatch(req.headers["if-match"]);
  const updatedStore = await store.update(
    storeToUpdate.id,
    storeUpdateDto,
    expectedDraftRevision,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("ETag", `\"${updatedStore.draft_revision}\"`);

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "update:store",
    updatedStore,
  );

  return sendJsonWithoutReplacingEtag(res, secureOutputValues);
}

function sendJsonWithoutReplacingEtag(
  res: NextApiResponse,
  body: Record<string, unknown>,
) {
  // Next's res.json()/res.send() generates an ETag from the response body and
  // replaces the draft-revision ETag set above. Ending the response directly
  // keeps the revision as the sole optimistic-concurrency validator.
  res.status(200);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(body));
}
