import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { NotFoundError, ValidationError } from "infra/errors";
import { sandboxEnabled } from "infra/runtime";

const healthCheck = z.object({
  // Appmax's public validator sends this placeholder instead of a numerical ID.
  app_id: z.union([z.number().int().positive(), z.literal("DEMO_APP_ID")]),
});

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const appId = Number(process.env.APPMAX_APPSTORE_NUMERIC_ID);
  if (
    !sandboxEnabled() ||
    process.env.VERCEL_ENV === "production" ||
    !Number.isSafeInteger(appId) ||
    appId < 1
  ) {
    throw new NotFoundError({
      message: "Appmax installation validation is unavailable.",
      action: "Check the sandbox validation URL and try again.",
    });
  }

  const parsed = healthCheck.safeParse(req.body);
  if (
    !parsed.success ||
    (parsed.data.app_id !== "DEMO_APP_ID" && parsed.data.app_id !== appId)
  ) {
    throw new ValidationError({
      message: "Invalid Appmax installation validation request.",
      action: "Check the Appmax numerical application ID.",
    });
  }

  // The health check is not proof of an authorized merchant installation.
  // In particular, the public validator must never change checkout settings.
  return res.status(200).json({ external_id: randomUUID() });
}

export default createRouter<NextApiRequest, NextApiResponse>()
  .post(postHandler)
  .handler(controller.errorHandlers);
