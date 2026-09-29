import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";

import controller from "infra/controller";
import { ForbiddenError, ValidationError } from "infra/errors";
import { prepareStorefrontPreview } from "lib/storefront-preview";
import authorization from "models/authorization";
import game from "models/game";
import store from "models/store";
import storeGameEditorial, {
  storeGameEditorialDeleteSchema,
  storeGameEditorialInputSchema,
} from "models/store_game_editorial";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_game"), getHandler)
  .put(controller.canRequest("update:store"), putHandler)
  .delete(controller.canRequest("update:store"), deleteHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const preview = prepareStorefrontPreview(req, res);
  const foundStore = await store.findOneForStorefront(
    req.query.slug as string,
    {
      preview,
      user: req.context.user,
    },
  );
  const foundGame = await game.findOneBySlug(req.query.gameSlug as string);
  if (!foundGame) return res.status(200).json({ review: null });

  const review =
    foundStore.storefront_source === "REVISION"
      ? (foundStore.game_editorials_snapshot.find(
          (entry) => entry.game_id === foundGame.id,
        ) ?? null)
      : ((
          await storeGameEditorial.findDraftByStoreAndGameIds(foundStore.id, [
            foundGame.id,
          ])
        )[0] ?? null);

  return res.status(200).json({
    review: review ? { headline: review.headline, body: review.body } : null,
  });
}

async function writableStore(req: NextApiRequest) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );
  if (!authorization.can(req.context.user, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to edit this Outlet's reviews.",
      action: "Ask the Outlet owner for catalog access.",
    });
  }
  return foundStore;
}

async function putHandler(req: NextApiRequest, res: NextApiResponse) {
  const input = storeGameEditorialInputSchema.safeParse(req.body);
  if (!input.success) {
    throw new ValidationError({
      message: "One or more review fields are invalid.",
      action: "Add review text and check the character limits.",
      context: input.error.issues,
    });
  }
  const foundStore = await writableStore(req);
  const result = await storeGameEditorial.upsert(
    foundStore.id,
    req.query.gameSlug as string,
    input.data,
  );
  return res.status(200).json({
    review: {
      headline: result.review.headline,
      body: result.review.body,
    },
    draft_revision: result.draft_revision,
  });
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const input = storeGameEditorialDeleteSchema.safeParse(req.body);
  if (!input.success) {
    throw new ValidationError({
      message: "The expected Outlet draft revision is required.",
      action: "Refresh the catalog and try again.",
      context: input.error.issues,
    });
  }
  const foundStore = await writableStore(req);
  const result = await storeGameEditorial.remove(
    foundStore.id,
    req.query.gameSlug as string,
    input.data.expected_draft_revision,
  );
  return res.status(200).json(result);
}
