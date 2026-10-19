import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { pruneProductEvents } from "models/product_event_retention";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from("Bearer " + (secret ?? ""));
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    res.status(401).end();
    return;
  }
  try {
    const result = await pruneProductEvents();
    console.info(
      JSON.stringify({ component: "product_events_retention", ...result }),
    );
    res.status(200).json(result);
  } catch {
    console.error(
      JSON.stringify({
        component: "product_events_retention",
        outcome: "failed",
      }),
    );
    res.status(503).json({ error: "Product event maintenance failed" });
  }
}
