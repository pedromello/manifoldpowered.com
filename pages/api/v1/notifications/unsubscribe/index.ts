import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import {
  notificationInput,
  privateNotificationResponse,
} from "infra/notification-controller";
import { notificationUnsubscribeSchema } from "contracts/outlet-notifications";
import { unsubscribeOutletNotification } from "models/outlet_notifications";

export default createRouter<NextApiRequest, NextApiResponse>()
  .post(async (req, res) => {
    privateNotificationResponse(res);
    // RFC8058 clients POST form data; the site posts JSON. GET never mutates.
    const input = notificationInput(notificationUnsubscribeSchema, {
      token: req.query.token ?? req.body?.token,
    });
    res.status(200).json(await unsubscribeOutletNotification(input.token));
  })
  .handler(controller.errorHandlers);
