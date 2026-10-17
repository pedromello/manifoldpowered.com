import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { selectionInput } from "infra/selection-controller";
import { discoverSelections } from "models/store_selection_discovery";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { limit } = selectionInput(
    z.object({ limit: z.coerce.number().int().min(1).max(12).default(3) }),
    req.query,
  );
  return res
    .status(200)
    .json({ selections: await discoverSelections(req, limit) });
}
