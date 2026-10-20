import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { privateSelectionResponse } from "infra/selection-controller";
import { adminHome, saveHome } from "models/home_editorial";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use((_req, res, next) => {
    privateSelectionResponse(res);
    return next();
  })
  .get(controller.canRequest("read:home:any"), async (req, res) =>
    res.status(200).json(await adminHome(req)),
  )
  .put(controller.canRequest("update:home:any"), async (req, res) => {
    await saveHome(req.body, req.context.user.id);
    return res.status(200).json(await adminHome(req));
  })
  .handler(controller.errorHandlers);
