import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { privateNotificationResponse } from "infra/notification-controller";
import { listOutletNotifications } from "models/outlet_notifications";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(
    controller.requireAuthentication,
    controller.canRequest("read:store_follow"),
    async (req, res) => {
      privateNotificationResponse(res);
      res.status(200).json(await listOutletNotifications(req.context.user.id!));
    },
  )
  .handler(controller.errorHandlers);
