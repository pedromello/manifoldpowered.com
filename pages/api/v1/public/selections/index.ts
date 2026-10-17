import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { selectionInput } from "infra/selection-controller";
import storeSelection from "models/store_selection";
import { selectionView } from "models/store_selection_view";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { limit } = selectionInput(
    z.object({ limit: z.coerce.number().int().min(1).max(12).default(3) }),
    req.query,
  );
  const candidates = await storeSelection.discoveryCandidates(limit);
  const results = await Promise.all(
    candidates.map(async ({ store_slug, selection_slug }) => {
      try {
        const view = await selectionView(req, store_slug, selection_slug);
        return view.games.length
          ? { ...view, games: view.games.slice(0, 3) }
          : null;
      } catch (error) {
        // An outlet or selection may be withdrawn between discovery and detail.
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          error.statusCode === 404
        )
          return null;
        throw error;
      }
    }),
  );
  return res
    .status(200)
    .json({ selections: results.filter((entry) => entry !== null) });
}
