import type { NextApiRequest, NextApiResponse } from "next";

/** Set cache policy before authorization so even preview 404s stay private. */
export function prepareStorefrontPreview(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  const preview = req.query.preview === "1";
  if (preview) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const currentVary = res.getHeader("Vary");
    const values = new Set(
      String(currentVary ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    values.add("Cookie");
    res.setHeader("Vary", [...values].join(", "));
  }
  return preview;
}
