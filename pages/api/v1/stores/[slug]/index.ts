import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store, { parseStoreDraftIfMatch } from "models/store";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .patch(controller.canRequest("update:store_presentation"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const previewQuery = req.query.preview;

  if (
    Array.isArray(previewQuery) ||
    (previewQuery !== undefined && previewQuery !== "1")
  ) {
    throw new ValidationError({
      message: "Invalid preview query parameter",
      action: 'Use "?preview=1" to preview an Outlet draft',
    });
  }

  const isPreview = previewQuery === "1";
  const foundStore = isPreview
    ? await store.findOneVisibleBySlug(slug as string, req.context.user, true)
    : await store.findOnePublishedBySlug(slug as string);

  if (isPreview) {
    setPrivatePreviewHeaders(res, foundStore.draft_revision);
  }

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    isPreview ? "read:store_preview" : "read:public_store",
    foundStore,
  );

  return res.status(200).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  const storeUpdateDto = req.body;
  const expectedDraftRevision = parseStoreDraftIfMatch(req.headers["if-match"]);

  const userTryingToUpdate = req.context.user;
  const storeToUpdate = await store.findOneBySlugWithRevisionAndMembers(
    slug as string,
  );

  if (
    !authorization.can(
      userTryingToUpdate,
      "update:store_presentation",
      storeToUpdate,
    )
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to update this Outlet's identity",
      action: "Only the Outlet owner or a platform administrator can do this",
    });
  }

  const updatedStore = await store.update(
    storeToUpdate.id,
    storeUpdateDto,
    expectedDraftRevision,
  );
  setPrivatePreviewHeaders(res, updatedStore.draft_revision);

  const secureOutputValues = authorization.filterOutput(
    userTryingToUpdate,
    "update:store_presentation",
    updatedStore,
  );

  return res.status(200).json(secureOutputValues);
}

function setPrivatePreviewHeaders(res: NextApiResponse, draftRevision: number) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("ETag", `"${draftRevision}"`);
}
