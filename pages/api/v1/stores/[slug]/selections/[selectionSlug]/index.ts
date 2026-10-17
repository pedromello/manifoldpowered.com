import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import {
  authorizeSelection,
  privateSelectionResponse,
  selectionInput,
  selectionParams,
} from "infra/selection-controller";
import { selectionUpdateSchema } from "contracts/outlet-selections";
import storeSelection from "models/store_selection";
import { selectionView } from "models/store_selection_view";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .patch(controller.canRequest("update:store"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug, selectionSlug } = selectionParams(req);
  const preview = req.query.preview === "1";
  if (preview) {
    privateSelectionResponse(res);
    await authorizeSelection(req, "read");
  }
  return res
    .status(200)
    .json(await selectionView(req, slug, selectionSlug!, preview));
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  privateSelectionResponse(res);
  const { selectionSlug } = selectionParams(req);
  const outlet = await authorizeSelection(req, "write");
  const input = selectionInput(selectionUpdateSchema, req.body);
  const row = await storeSelection.update(outlet.id, selectionSlug!, input);
  return res.status(200).json({
    selection: await storeSelection.summary(
      row,
      outlet.slug,
      storeSelection.snapshot(row),
      true,
    ),
  });
}
