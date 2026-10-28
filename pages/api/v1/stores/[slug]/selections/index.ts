import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import {
  authorizeSelection,
  privateSelectionResponse,
  selectionInput,
  selectionParams,
} from "infra/selection-controller";
import {
  selectionCreateSchema,
  selectionLibraryQuerySchema,
} from "contracts/outlet-selections";
import store from "models/store";
import storeSelection from "models/store_selection";
import storefrontPricing from "models/storefront_pricing";
import type { Prisma } from "generated/prisma/client";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:public_store"), getHandler)
  .post(controller.canRequest("update:store"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = selectionParams(req);
  const query = selectionInput(
    selectionLibraryQuerySchema.extend({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      preview: z.enum(["0", "1"]).optional(),
    }),
    req.query,
  );
  const preview = query.preview === "1";
  if (preview) {
    privateSelectionResponse(res);
    await authorizeSelection(req, "read");
  }
  const outlet = await store.findOneForStorefront(slug, {
    preview,
    user: req.context.user,
  });
  const { rows, pagination } = await storeSelection.list(
    outlet.id,
    preview,
    query.page,
    query.limit,
    { q: query.q, order: query.order },
  );
  let publicEligibility: Prisma.GameWhereInput = {};
  if (!preview) {
    const curation = await store.getStorefrontCurationWhereClause(outlet);
    const { gameIds } = await storefrontPricing.idConstraintForRequest(req);
    publicEligibility = {
      AND: [
        curation,
        ...(gameIds
          ? [
              {
                OR: [
                  { status: "ONLY_DISPLAY" as const },
                  { status: "ACTIVE" as const, id: { in: gameIds } },
                ],
              },
            ]
          : []),
      ],
    };
  }
  const selections = await storeSelection.summaries(
    rows,
    slug,
    preview,
    publicEligibility,
  );
  return res.status(200).json({ selections, pagination });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  privateSelectionResponse(res);
  const outlet = await authorizeSelection(req, "write");
  const input = selectionInput(selectionCreateSchema, req.body);
  const row = await storeSelection.create(outlet.id, input);
  const selection = await storeSelection.summary(
    row,
    outlet.slug,
    storeSelection.snapshot(row),
    true,
  );
  return res
    .status(201)
    .json({ selection, preview_path: `${selection.public_path}?preview=1` });
}
