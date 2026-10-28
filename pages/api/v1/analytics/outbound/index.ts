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
  .get(async (req, res) => {
    // Existing administrators retain access while the normal feature backfill rolls out.
    if (
      !authorization.can(req.context.user, "read:store_analytics:any") &&
      !authorization.can(req.context.user, "read:dashboard:any")
    ) {
      throw new ForbiddenError({
        message: "You do not have permission to view platform analytics.",
      });
    }
    const parsed = outboundAnalyticsQuerySchema.safeParse(req.query);
    if (!parsed.success)
      throw new ValidationError({ message: "Invalid analytics filters." });
    const outlet = parsed.data.store_slug
      ? await store.findOneBySlug(parsed.data.store_slug)
      : null;
    return res
      .status(200)
      .json(await outboundProductClicks(parsed.data, outlet?.id));
  })
  .handler(controller.errorHandlers);
