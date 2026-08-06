import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import studio from "models/studio";
import sale from "models/sale";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";

const salesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Sales of a studio's own games.
//
// A studio is a supplier rather than an affiliate, so its legal posture differs
// from an outlet's — but the buyer is withheld either way. The filter branch
// carries no buyer field at all, not even the pseudonym an outlet gets: a
// studio has no use for telling one buyer from another, and the cheapest way to
// keep consumer data out of a second party's hands is not to send it.
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:studio_sale"), getHandler)
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

  // findOneBySlugWithMembers, not findOneBySlug: the studio branch of can()
  // decides on the members array, so a permitted member would otherwise be
  // refused their own studio's numbers.
  const foundStudio = await studio.findOneBySlugWithMembers(slug as string);

  // canRequest only established that this user holds the feature at all. The
  // slug is caller-supplied, so this is what stops one studio reading another's.
  if (!authorization.can(userTryingToRead, "read:studio_sale", foundStudio)) {
    throw new ForbiddenError({
      message: "You do not have permission to view this studio's sales",
      action: "Verify if you are an administrator of this studio",
    });
  }

  const { sales, pagination } = await sale.listByStudio(foundStudio.id, {
    page: result.data.page,
    limit: result.data.limit,
  });

  const secureOutputValues = sales.map((saleItem) =>
    authorization.filterOutput(userTryingToRead, "read:studio_sale", saleItem),
  );

  return res.status(200).json({
    sales: secureOutputValues,
    pagination,
  });
}
