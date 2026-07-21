import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import dashboard from "models/dashboard";
import authorization from "models/authorization";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:dashboard:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const metrics = await dashboard.getMetrics();

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:dashboard:any",
    metrics,
  );

  return res.status(200).json(secureOutputValues);
}
