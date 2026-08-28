import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import authorization from "models/authorization";
import steamImport from "models/steam_import";
import { ValidationError } from "infra/errors";

const steamImportRequestSchema = z.object({
  steam_app_id: z
    .string()
    .regex(/^[1-9]\d*$/, "steam_app_id must be a positive integer string"),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("import:steam_game"), postHandler)
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

  const importResult = await steamImport.importGame({
    userId: req.context.user.id!,
    steamAppId: result.data.steam_app_id,
    isAdmin: authorization.can(req.context.user, "read:game:any"),
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "import:steam_game",
    importResult.game,
  );

  return res.status(importResult.created ? 201 : 200).json(secureOutputValues);
}
