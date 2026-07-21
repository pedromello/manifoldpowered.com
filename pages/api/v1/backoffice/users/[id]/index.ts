import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import authorization from "models/authorization";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:user:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  const foundUser = await user.findOneById(id as string);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:user:any",
    foundUser,
  );

  return res.status(200).json(secureOutputValues);
}
