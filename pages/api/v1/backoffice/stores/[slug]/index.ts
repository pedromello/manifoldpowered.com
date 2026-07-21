import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:store:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const foundStore = await store.findOneBySlug(slug as string);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:store:any",
    foundStore,
  );

  return res.status(200).json(secureOutputValues);
}
