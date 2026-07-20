import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user, { userAdminQuerySchema } from "models/user";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:user:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = userAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { users, pagination } = await user.findAllPaginated(result.data);

  const secureOutputValues = users.map((userItem) =>
    authorization.filterOutput(req.context.user, "read:user:any", userItem),
  );

  return res.status(200).json({
    users: secureOutputValues,
    pagination,
  });
}
