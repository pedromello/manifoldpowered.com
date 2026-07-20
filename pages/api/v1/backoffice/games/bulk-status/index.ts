import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import game, { gameStatusValues } from "models/game";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { NotFoundError, ValidationError } from "infra/errors";

const bulkStatusSchema = z
  .object({
    slugs: z.array(z.string()).min(1).max(100),
    status: z.enum(gameStatusValues),
    reason: z.string().min(1).max(1000).optional(),
  })
  .refine((data) => data.status === "ACTIVE" || !!data.reason, {
    message: "reason is required when moving games to PRIVATE or INACTIVE",
    path: ["reason"],
  });

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("update:game:status:any"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = bulkStatusSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid bulk status update payload",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { slugs, status, reason } = result.data;

  const existingGames = await Promise.all(
    slugs.map((slug) => game.findOneBySlug(slug)),
  );

  const missingSlugs = slugs.filter((_, index) => !existingGames[index]);
  if (missingSlugs.length > 0) {
    throw new NotFoundError({
      message: `The following games were not found: ${missingSlugs.join(", ")}.`,
      action: "Check the slugs and try again.",
    });
  }

  const updatedGames = await Promise.all(
    existingGames.map(async (existingGame) => {
      const updatedGame = await game.setStatus(existingGame!.id, status);

      await auditLog.record({
        admin_user_id: req.context.user.id as string,
        action: "game:status:update",
        target_type: "game",
        target_id: existingGame!.id,
        reason,
      });

      return updatedGame;
    }),
  );

  const secureOutputValues = updatedGames.map((updatedGame) =>
    authorization.filterOutput(
      req.context.user,
      "update:game:status:any",
      updatedGame,
    ),
  );

  return res.status(200).json({ games: secureOutputValues });
}
