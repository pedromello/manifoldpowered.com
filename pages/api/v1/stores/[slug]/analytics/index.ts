import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";
import {
  outboundAnalyticsQuerySchema,
  outboundProductClicks,
} from "models/product_event_reports";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return next();
  })
  .use(controller.injectAnonymousOrUser)
  .get(
    controller.requireAuthentication,
    controller.canRequest("update:user"),
    async (req, res) => {
      // update:user is the existing active-account marker. Resource ownership alone
      // must not restore analytics access to a disabled account with a valid session.
      const outlet = await store.findOneBySlugWithMembers(
        String(req.query.slug),
      );
      if (
        !authorization.can(req.context.user, "read:store_analytics", outlet)
      ) {
        throw new ForbiddenError({
          message:
            "You do not have permission to view this Outlet's analytics.",
        });
      }
      const parsed = outboundAnalyticsQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ValidationError({ message: "Invalid analytics filters." });
      return res
        .status(200)
        .json(await outboundProductClicks(parsed.data, outlet.id));
    },
  )
  .handler(controller.errorHandlers);
