import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import { loadPublicRasterImage } from "lib/public-raster-image";
import { isPublicStaticImage } from "lib/raster-image";
import { SITE_ORIGIN } from "lib/seo";

export default createRouter<NextApiRequest, NextApiResponse>()
  .get(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (typeof req.query.slug !== "string") return res.status(404).end();
    // This method can only read a published revision, regardless of cookies or
    // preview flags. The source check also prevents publication races and stops
    // this endpoint from becoming an arbitrary URL proxy.
    const published = await store.findOnePublishedBySlug(req.query.slug);
    if (!published.logo_url || req.query.source !== published.logo_url)
      return res.status(404).end();
    const source = new URL(published.logo_url);
    if (
      (source.origin === SITE_ORIGIN || source.host === req.headers.host) &&
      !isPublicStaticImage(source)
    )
      return res.status(404).end();
    const image = await loadPublicRasterImage(published.logo_url);
    if (!image) return res.status(404).end();
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).end(image.bytes);
  })
  .handler(controller.errorHandlers);
