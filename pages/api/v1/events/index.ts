import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import webserver from "infra/webserver";
import {
  ForbiddenError,
  ConflictError,
  UnauthorizedError,
  RateLimitError,
  ServiceError,
  ValidationError,
} from "infra/errors";
import { clientEventsEnabled } from "infra/product_event_config";
import {
  bootstrapEventContext,
  touchEventContext,
} from "infra/product_event_context";
import { eventEnvelopeSchema } from "contracts/product-events";
import {
  ingestProductEvents,
  reserveEventQuota,
} from "models/product_event_ingest";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };
const router = createRouter<NextApiRequest, NextApiResponse>()
  .use(async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    if (!clientEventsEnabled())
      throw new ServiceError({ message: "Event collection is disabled" });
    return next();
  })
  .post(checkRequest, controller.injectAnonymousOrUser, postHandler);

function checkRequest(
  req: NextApiRequest,
  _res: NextApiResponse,
  next: () => Promise<unknown>,
) {
  const allowed = new Set([new URL(webserver.getOrigin()).origin]);
  const base = new URL(webserver.getOrigin());
  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(base.hostname)
  ) {
    allowed.add(base.protocol + "//127.0.0.1:" + base.port);
    allowed.add(base.protocol + "//localhost:" + base.port);
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV !== "preview"
  ) {
    allowed.add("https://www.manifoldpowered.com");
    allowed.add("https://manifoldpowered.com");
  }
  if (
    typeof req.headers.origin !== "string" ||
    !allowed.has(req.headers.origin) ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    throw new ForbiddenError({ message: "Invalid event origin" });
  if (
    req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new ValidationError({ message: "Use application/json" });
  }
  return next();
}
async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const envelope = eventEnvelopeSchema.safeParse(req.body);
  if (!envelope.success)
    throw new ValidationError({ message: "Invalid event envelope" });
  try {
    await reserveEventQuota(
      req,
      envelope.data.type === "bootstrap" ? 1 : envelope.data.events.length,
    );
  } catch (error) {
    if (error instanceof RateLimitError)
      res.setHeader(
        "Retry-After",
        String(60 - (Math.floor(Date.now() / 1000) % 60)),
      );
    throw error;
  }
  if (envelope.data.type === "bootstrap") {
    return res.status(200).json(await bootstrapEventContext(req, res));
  }
  const { context, accepted, duplicated } = await ingestProductEvents(
    req,
    envelope.data.context_generation,
    envelope.data.events,
  );
  touchEventContext(res, context);
  console.info(
    JSON.stringify({
      component: "product_events",
      outcome: "persisted",
      accepted,
      duplicated,
    }),
  );
  return res.status(200).json({ accepted, duplicated });
}
export default router.handler({
  ...controller.errorHandlers,
  onError(error, req, res) {
    const known =
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError ||
      error instanceof RateLimitError ||
      error instanceof UnauthorizedError ||
      error instanceof ServiceError;
    // Prisma error messages may contain event payloads; never put them in logs/responses.
    const safe = known
      ? error
      : new ServiceError({ message: "Event persistence is unavailable" });
    console.info(
      JSON.stringify({
        component: "product_events",
        outcome: "rejected",
        status_code: safe.statusCode,
      }),
    );
    controller.errorHandlers.onError(safe, req, res);
  },
});
