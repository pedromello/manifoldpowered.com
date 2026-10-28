import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { prisma } from "infra/database";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { prepareStorefrontPreview } from "lib/storefront-preview";
import authorization from "models/authorization";
import store from "models/store";
import {
  getDraftAffiliateSnapshot,
  parseAffiliateSnapshot,
  removeAffiliateLink,
  resolveAffiliateGameLinks,
  saveAffiliateLink,
} from "models/store_affiliate";
import {
  AFFILIATE_MERCHANTS,
  affiliateDeleteSchema,
  affiliateWriteSchema,
  isAffiliateUrl,
} from "contracts/outlet-affiliates";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .post(controller.canRequest("update:store"), saveHandler)
  .patch(controller.canRequest("update:store"), saveHandler)
  .delete(controller.canRequest("update:store"), deleteHandler)
  .handler(controller.errorHandlers);

async function writableStore(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  // GET draft reads must enforce the same account-level gate as mutations.
  // Resource ownership alone must not restore access after an account is disabled.
  if (!authorization.can(req.context.user, "update:store"))
    throw new ForbiddenError({
      message:
        "You do not have permission to edit this Outlet's affiliate links.",
      action: "Ask the Outlet owner for editing access.",
    });
  const found = await store.findOneBySlugWithMembers(req.query.slug as string);
  if (!authorization.can(req.context.user, "update:store", found))
    throw new ForbiddenError({
      message:
        "You do not have permission to edit this Outlet's affiliate links.",
      action: "Ask the Outlet owner for editing access.",
    });
  return found;
}

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const preview = prepareStorefrontPreview(req, res);
  if (preview && !authorization.can(req.context.user, "update:user")) {
    if (!req.context.user.id)
      throw new NotFoundError({
        message: "Outlet not found.",
        action: "Check the Outlet link.",
      });
    throw new ForbiddenError({
      message:
        "You do not have permission to preview this Outlet's affiliate links.",
      action:
        "Sign in with an active account that can inspect this Outlet's draft.",
    });
  }
  if (req.query.draft === "1") {
    const found = await writableStore(req, res);
    const snapshot = await getDraftAffiliateSnapshot(found.id);
    return res
      .status(200)
      .json({ links: snapshot.links, draft_revision: found.draft_revision });
  }
  const found = await store.findOneForStorefront(req.query.slug as string, {
    preview,
    user: req.context.user,
  });
  let snapshot;
  if (preview) snapshot = await getDraftAffiliateSnapshot(found.id);
  else {
    const revision = await prisma.storeRevision.findFirst({
      where: { id: found.published_revision?.id, store_id: found.id },
      select: { affiliate_links: true },
    });
    if (!revision)
      throw new NotFoundError({
        message: "Outlet not found.",
        action: "Check the Outlet link.",
      });
    snapshot = parseAffiliateSnapshot(revision.affiliate_links);
  }
  const gameSlug = req.query.game_slug;
  if (
    gameSlug !== undefined &&
    (typeof gameSlug !== "string" || !gameSlug || gameSlug.length > 255)
  ) {
    throw new ValidationError({
      message: "Invalid game slug.",
      action: "Choose a game from the catalog.",
    });
  }
  const links =
    typeof gameSlug === "string"
      ? await resolveAffiliateGameLinks(snapshot.links, gameSlug)
      : snapshot.links
          .filter(
            (link) =>
              link.kind === "storefront" &&
              isAffiliateUrl(link.merchant, link.url),
          )
          .sort(
            (a, b) =>
              AFFILIATE_MERCHANTS.indexOf(a.merchant) -
              AFFILIATE_MERCHANTS.indexOf(b.merchant),
          );
  return res.status(200).json({
    links,
    published_revision_id: preview ? null : found.published_revision!.id,
  });
}

async function saveHandler(req: NextApiRequest, res: NextApiResponse) {
  const found = await writableStore(req, res);
  const input = affiliateWriteSchema.safeParse(req.body);
  if (!input.success)
    throw new ValidationError({
      message: "One or more affiliate link fields are invalid.",
      action: "Check the store, platform and affiliate URL.",
      context: input.error.issues,
    });
  if (req.method === "PATCH" && !input.data.link.id)
    throw new ValidationError({
      message: "Choose an affiliate link to edit.",
      action: "Refresh the links and try again.",
    });
  if (req.method === "POST" && input.data.link.id)
    throw new ValidationError({
      message: "New affiliate links cannot specify an ID.",
      action: "Use PATCH to edit an existing link.",
    });
  const result = await saveAffiliateLink(
    found.id,
    input.data.expected_draft_revision,
    input.data.link,
  );
  return res.status(req.method === "POST" ? 201 : 200).json(result);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const found = await writableStore(req, res);
  const input = affiliateDeleteSchema.safeParse(req.body);
  if (!input.success)
    throw new ValidationError({
      message: "Choose a link and the current draft revision.",
      action: "Refresh the links and try again.",
    });
  return res
    .status(200)
    .json(
      await removeAffiliateLink(
        found.id,
        input.data.expected_draft_revision,
        input.data.id,
      ),
    );
}
