import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import authorization from "models/authorization";
import steamImport from "models/steam_import";
import { ValidationError } from "infra/errors";
import * as steamRefresh from "models/steam_refresh";

const steamImportRequestSchema = z.object({
  steam_app_id: z
    .string()
    .max(20)
    .regex(/^[1-9]\d*$/, "steam_app_id must be a positive integer string"),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("import:steam_game"), postHandler)
  .get(controller.canRequest("import:steam_game"), getHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = steamImportRequestSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const importResult = await steamImport
    .importGame({
      userId: req.context.user.id!,
      steamAppId: result.data.steam_app_id,
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
  return respond(req, res, importResult);
}

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  if (
    typeof req.query.operation_id === "string" &&
    z.uuid().safeParse(req.query.operation_id).success
  )
    return respond(
      req,
      res,
      await steamRefresh.status(req.query.operation_id),
      true,
    );
  const input = steamImportRequestSchema.safeParse(req.query);
  if (!input.success)
    throw new ValidationError({
      message: "Invalid Steam update request.",
      action: "Check the operation or Steam app ID.",
      context: input.error.issues,
    });
  return respond(
    req,
    res,
    await steamRefresh.statusForApp(input.data.steam_app_id),
    true,
  );
}

async function respond(
  req: NextApiRequest,
  res: NextApiResponse,
  importResult: Awaited<ReturnType<typeof steamRefresh.statusForApp>>,
  polling = false,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (importResult.refresh?.state === "in_progress")
    res.setHeader("Retry-After", "2");
  if (!importResult.game)
    return res
      .status(
        !polling && importResult.refresh?.state === "in_progress" ? 202 : 200,
      )
      .json({ refresh: importResult.refresh });
  if (!["ACTIVE", "ONLY_DISPLAY"].includes(importResult.game.status))
    return res
      .status(200)
      .json({ message: "This game is currently hidden from the catalog." });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "import:steam_game",
    importResult.game,
  );

  return res
    .status(importResult.created ? 201 : 200)
    .json({ ...secureOutputValues, refresh: importResult.refresh });
}
