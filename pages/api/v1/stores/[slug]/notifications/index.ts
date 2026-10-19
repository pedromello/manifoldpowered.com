import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import {
  notificationInput,
  notificationStoreSlug,
  privateNotificationResponse,
  requireNotificationOrigin,
} from "infra/notification-controller";
import { notificationToggleSchema } from "contracts/outlet-notifications";
import {
  notificationStatus,
  setOutletNotification,
} from "models/outlet_notifications";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .get(controller.canRequest("read:store_follow_status"), async (req, res) => {
    privateNotificationResponse(res);
    res
      .status(200)
      .json(
        await notificationStatus(
          req.context.user.id!,
          notificationStoreSlug(req),
        ),
      );
  })
  .put(controller.canRequest("create:store_follow"), async (req, res) => {
    privateNotificationResponse(res);
    requireNotificationOrigin(req);
    const input = notificationInput(notificationToggleSchema, req.body);
    res
      .status(200)
      .json(
        await setOutletNotification(
          req.context.user.id!,
          notificationStoreSlug(req),
          input.enabled,
          input.locale,
        ),
      );
  })
  .handler(controller.errorHandlers);
