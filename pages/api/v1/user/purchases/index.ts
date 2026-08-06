import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import sale from "models/sale";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

const purchasesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// A buyer's own purchase history.
//
// The library shows what someone owns; this shows what they paid, in the
// currency they were charged, on the date they were charged, through whichever
// outlet they arrived from. Those are only reconstructible from Sale, and
// read:library deliberately shows the game's current list price instead.
//
// Scoped to the session user with no id in the request, so there is no
// parameter to tamper with and one buyer cannot ask for another's history.
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:own_sale"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = purchasesQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToRead = req.context.user;

  const { sales, pagination } = await sale.listByUser(
    userTryingToRead.id as string,
    { page: result.data.page, limit: result.data.limit },
  );

  const secureOutputValues = sales.map((saleItem) =>
    authorization.filterOutput(userTryingToRead, "read:own_sale", saleItem),
  );

  return res.status(200).json({
    purchases: secureOutputValues,
    pagination,
  });
}
