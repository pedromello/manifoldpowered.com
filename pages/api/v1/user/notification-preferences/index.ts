import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import {
  notificationInput,
  privateNotificationResponse,
  requireNotificationOrigin,
} from "infra/notification-controller";
import { notificationPreferencesSchema } from "contracts/outlet-notifications";
import {
  notificationPreferences,
  updateNotificationPreferences,
} from "models/outlet_notifications";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .get(async (req, res) => {
    privateNotificationResponse(res);
    res.status(200).json(await notificationPreferences(req.context.user.id!));
  })
  .patch(async (req, res) => {
    privateNotificationResponse(res);
    requireNotificationOrigin(req);
    const input = notificationInput(notificationPreferencesSchema, req.body);
    res
      .status(200)
      .json(
        await updateNotificationPreferences(
          req.context.user.id!,
          input.email_locale,
        ),
      );
  })
  .handler(controller.errorHandlers);
