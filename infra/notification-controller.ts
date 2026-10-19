import type { NextApiRequest, NextApiResponse } from "next";
import { ForbiddenError, ValidationError } from "infra/errors";
import webserver from "infra/webserver";
import type { z } from "zod";

export function privateNotificationResponse(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
}

export function notificationInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError({
      message: "Invalid notification preferences.",
      action: "Check the supported input fields.",
    });
  return parsed.data;
}

/** Cookie-authenticated mutations reject cross-site browser requests; CLI has no Origin. */
export function requireNotificationOrigin(req: NextApiRequest) {
  const origin = req.headers.origin;
  const allowed = new Set([new URL(webserver.getOrigin()).origin]);
  const hostname = new URL(webserver.getOrigin()).hostname;
  if (["manifoldpowered.com", "www.manifoldpowered.com"].includes(hostname)) {
    allowed.add("https://manifoldpowered.com");
    allowed.add("https://www.manifoldpowered.com");
  }
  if (
    req.headers["sec-fetch-site"] === "cross-site" ||
    (origin && (typeof origin !== "string" || !allowed.has(origin)))
  )
    throw new ForbiddenError({
      message: "Cross-site notification changes are not allowed.",
    });
}

export function notificationStoreSlug(req: NextApiRequest) {
  const slug = req.query.slug;
  if (typeof slug !== "string" || !slug || slug.length > 255)
    throw new ValidationError({ message: "Invalid outlet slug." });
  return slug;
}
