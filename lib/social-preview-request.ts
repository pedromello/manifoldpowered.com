import type { NextApiRequest } from "next";
import { COUNTRY_HEADER, SSR_COUNTRY_HEADER } from "lib/country";

/** Non-transactional previews use one public catalog region, not caller cookies. */
export function socialPreviewRequest(req: NextApiRequest): NextApiRequest {
  if (req.query.social_preview !== "1" || req.query.preview === "1") return req;
  return Object.assign(Object.create(req), {
    headers: {
      ...req.headers,
      [COUNTRY_HEADER]: "US",
      [SSR_COUNTRY_HEADER]: "US",
    },
  });
}
