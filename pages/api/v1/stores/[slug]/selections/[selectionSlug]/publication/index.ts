import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import {
  authorizeSelection,
  privateSelectionResponse,
  selectionInput,
  selectionParams,
} from "infra/selection-controller";
import { selectionPublicationSchema } from "contracts/outlet-selections";
import storeSelection from "models/store_selection";
import { prisma } from "infra/database";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.requireAuthentication, getHandler)
  .post(controller.canRequest("publish:store"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  privateSelectionResponse(res);
  const outlet = await authorizeSelection(req, "read");
  const { selectionSlug } = selectionParams(req);
  const row = await storeSelection.findDraft(outlet.id, selectionSlug!);
  const games = await prisma.game.findMany({
    where: {
      id: { in: row.game_ids },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
    },
    select: { slug: true, title: true },
  });
  return res.status(200).json({
    selection: await storeSelection.summary(
      row,
      outlet.slug,
      storeSelection.snapshot(row),
      true,
    ),
    readiness: await storeSelection.readiness(row),
    games,
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  privateSelectionResponse(res);
  const outlet = await authorizeSelection(req, "publish");
  const { selectionSlug } = selectionParams(req);
  const input = selectionInput(selectionPublicationSchema, req.body);
  const row =
    input.action === "publish"
      ? await storeSelection.publish(
          outlet.id,
          selectionSlug!,
          req.context.user.id!,
          input.expected_draft_revision,
        )
      : await storeSelection.unpublish(
          outlet.id,
          selectionSlug!,
          input.expected_draft_revision,
        );
  return res.status(200).json({
    selection: await storeSelection.summary(
      row,
      outlet.slug,
      storeSelection.snapshot(row),
      true,
    ),
  });
}
