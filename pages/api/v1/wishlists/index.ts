import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import wishlist from "models/wishlist";
import { ValidationError } from "infra/errors";
import { z } from "zod";

const querySchema = z.object({
  slug: z.string().min(1),
});

const bodySchema = z.object({
  slug: z.string().min(1),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:wishlist"), getHandler)
  .post(controller.canRequest("create:wishlist"), postHandler)
  .delete(controller.canRequest("delete:wishlist"), deleteHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsedQuery = querySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    throw new ValidationError({
      message: "Query validation failed.",
      action: "Provide the 'slug' parameter in the query string.",
      cause: parsedQuery.error,
    });
  }

  const { slug } = parsedQuery.data;
  const userId = req.context?.user?.id;

  const result = await wishlist.getCountsAndStatus(userId, slug);
  return res.status(200).json(result);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userTryingToWishlist = req.context?.user;

  const parsedBody = bodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new ValidationError({
      message: "Request body validation failed.",
      action: "Provide the 'slug' in the request body.",
      cause: parsedBody.error,
    });
  }

  const { slug } = parsedBody.data;

  await wishlist.add(userTryingToWishlist.id, slug);

  return res.status(201).json({ message: "Game added to wishlist" });
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const userTryingToWishlist = req.context?.user;

  const parsedBody = bodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new ValidationError({
      message: "Request body validation failed.",
      action: "Provide the 'slug' in the request body.",
      cause: parsedBody.error,
    });
  }

  const { slug } = parsedBody.data;

  await wishlist.remove(userTryingToWishlist.id, slug);

  return res.status(200).json({ message: "Game removed from wishlist" });
}
