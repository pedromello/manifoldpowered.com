import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { recoverSelectionEmails } from "models/selection_email";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    res.status(401).end();
    return;
  }
  try {
    const result = await recoverSelectionEmails();
    res.status(200).json(result);
  } catch {
    console.error(
      JSON.stringify({
        component: "selection_email_recovery",
        outcome: "failed",
      }),
    );
    res.status(503).json({ error: "Selection email recovery failed" });
  }
}
