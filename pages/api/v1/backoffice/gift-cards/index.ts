import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import operations from "models/gift_card_operations";
import { assertSandbox } from "infra/runtime";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .get(controller.canRequest("read:gift_card:any"), async (req, res) => {
    assertSandbox();
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(200)
      .json(
        authorization.filterOutput(
          req.context.user,
          "read:gift_card:any",
          await operations.summary(),
        ),
      );
  })
  .handler(controller.errorHandlers);
