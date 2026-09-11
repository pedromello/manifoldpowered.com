import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import authorization from "models/authorization";
import nintendoImport from "models/nintendo_import";
import storefrontPricing from "models/storefront_pricing";
import * as nintendoRefresh from "models/nintendo_refresh";
import { parseNintendoUrl } from "lib/nintendo";

const inputSchema = z.object({ eshop_url: z.string().max(2048) }).strict();

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("import:nintendo_game"), postHandler)
  .get(controller.canRequest("import:nintendo_game"), getHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const input = inputSchema.safeParse(req.body);
  if (!input.success)
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the Nintendo product link.",
      context: input.error.issues,
    });
  const result = await nintendoImport
    .importGame({
      userId: req.context.user.id!,
      eshopUrl: input.data.eshop_url,
      isAdmin: authorization.can(req.context.user, "read:game:any"),
    })
    .catch((error: unknown) => {
      const retry = z
        .object({ context: z.object({ retry_after: z.number() }) })
        .safeParse(error);
      if (retry.success)
        res.setHeader("Retry-After", retry.data.context.retry_after);
      throw error;
    });
  return respond(req, res, result);
}

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  if (
    typeof req.query.operation_id === "string" &&
    z.uuid().safeParse(req.query.operation_id).success
  )
    return respond(
      req,
      res,
      await nintendoRefresh.status(
        req.query.operation_id,
        typeof req.query.eshop_url === "string"
          ? parseNintendoUrl(req.query.eshop_url)?.country
          : undefined,
      ),
      true,
    );
  const input =
    typeof req.query.eshop_url === "string"
      ? parseNintendoUrl(req.query.eshop_url)
      : null;
  if (!input)
    throw new ValidationError({
      message: "Invalid Nintendo update request.",
      action: "Check the operation or product link.",
    });
  return respond(
    req,
    res,
    await nintendoRefresh.statusForSlug(input.slug, input.country),
    true,
  );
}

async function respond(
  req: NextApiRequest,
  res: NextApiResponse,
  result: Awaited<ReturnType<typeof nintendoRefresh.statusForSlug>>,
  polling = false,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (result.refresh?.state === "in_progress")
    res.setHeader("Retry-After", "2");
  if (!result.game)
    return res
      .status(!polling && result.refresh?.state === "in_progress" ? 202 : 200)
      .json({ refresh: result.refresh });
  const context = await storefrontPricing.contextFor("BRL", [result.game], req);
  // Moderated entries must not become visible by reimporting their source URL.
  if (!["ACTIVE", "ONLY_DISPLAY"].includes(result.game.status)) {
    return res
      .status(200)
      .json({ message: "This game is currently hidden from the catalog." });
  }
  return res.status(result.created ? 201 : 200).json({
    ...storefrontPricing.filterAndPrice(
      req.context.user,
      [result.game],
      context,
    )[0],
    refresh: result.refresh,
  });
}
