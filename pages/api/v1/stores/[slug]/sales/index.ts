import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import store from "models/store";
import sale from "models/sale";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

const salesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("update:store"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const result = salesQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userTryingToRead = req.context.user;
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  if (!authorization.can(userTryingToRead, "update:store", foundStore)) {
    throw new ForbiddenError({
      message: "You do not have permission to view this store's sales",
      action: "Verify if you are an administrator of this store",
    });
  }

  const { sales, pagination } = await sale.listByStore(foundStore.id, {
    page: result.data.page,
    limit: result.data.limit,
  });

  const secureOutputValues = sales.map((saleItem) =>
    authorization.filterOutput(userTryingToRead, "read:store_sale", saleItem),
  );

  return res.status(200).json({
    sales: secureOutputValues,
    pagination,
  });
}
