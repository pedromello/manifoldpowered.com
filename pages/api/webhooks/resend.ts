import type { NextApiRequest, NextApiResponse } from "next";
import { Resend, type WebhookEventPayload } from "resend";
import { handleSelectionEmailWebhook } from "models/selection_email";

export const config = { api: { bodyParser: false } };
const MAX_BODY_BYTES = 256 * 1024;

function header(req: NextApiRequest, key: string) {
  const value = req.headers[key];
  return typeof value === "string" ? value : "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    res.status(503).json({ error: "Webhook unavailable" });
    return;
  }
  const id = header(req, "svix-id");
  const timestamp = header(req, "svix-timestamp");
  const signature = header(req, "svix-signature");
  if (!id || !timestamp || !signature) {
    res.status(400).json({ error: "Invalid webhook" });
    return;
  }
  let event: WebhookEventPayload;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        res.status(413).end();
        return;
      }
      chunks.push(buffer);
    }
    event = new Resend(
      process.env.RESEND_API_KEY || "webhook-verification",
    ).webhooks.verify({
      payload: Buffer.concat(chunks).toString("utf8"),
      headers: { id, timestamp, signature },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    res.status(400).json({ error: "Invalid webhook" });
    return;
  }
  try {
    await handleSelectionEmailWebhook(event, id);
    res.status(200).json({ received: true });
  } catch {
    res.status(503).json({ error: "Webhook processing failed" });
  }
}
