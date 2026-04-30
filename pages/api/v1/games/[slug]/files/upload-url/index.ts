import { createRouter } from "next-connect";
import controller from "infra/controller";
import game from "models/game";
import authorization from "models/authorization";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import storage from "infra/storage";
import { z } from "zod";
import { NextApiRequest, NextApiResponse } from "next";

const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024 * 1024), // 2GB limit
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:game_file"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  // TODO: Implement "Transactional Upload" pattern in the future to prevent dangling objects in storage.
  // This should involve creating a database record with a "PENDING" status before generating the upload URL,
  // and then updating it to "READY" once the client confirms the upload is finished.
  // This will be necessary when a public client-side is implemented for this use case.
  const querySchema = z.object({
    slug: z.string().min(1).max(255),
  });

  const queryParse = querySchema.safeParse(req.query);
  if (!queryParse.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the URL and try again",
      cause: queryParse.error,
    });
  }

  const { slug } = queryParse.data;
  const gameResource = await game.findOneBySlug(slug);

  if (!gameResource) {
    throw new NotFoundError({
      message: "Game not found",
      action: "Check the URL and try again",
    });
  }

  if (!authorization.can(req.context.user, "create:game_file", gameResource)) {
    throw new ForbiddenError({
      message: "You are not allowed to upload files for this game",
      action: "Make sure you are the owner of the game",
    });
  }

  const parseResult = uploadUrlSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError({
      message: "Invalid request payload",
      action: "Check the payload and try again",
      cause: parseResult.error,
    });
  }

  const { filename, content_type } = parseResult.data;

  // Generate a unique object key to prevent overwrites
  const objectKey = `games/${gameResource.id}/files/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

  const uploadUrl = await storage.getUploadUrl(objectKey, content_type);

  return res.status(200).json({
    upload_url: uploadUrl,
    object_key: objectKey,
  });
}
