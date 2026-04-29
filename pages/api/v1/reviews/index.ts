import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import review from "models/review";
import { ValidationError } from "infra/errors";
import { z } from "zod";
import authorization from "models/authorization";

const querySchema = z.object({
  slug: z.string().min(1),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const bodySchema = z.object({
  slug: z.string().min(1),
});

const postBodySchema = z.object({
  slug: z.string().min(1),
  message: z.string().min(1).max(3000),
  recommended: z.boolean(),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:review"), getHandler)
  .post(controller.canRequest("create:review"), postHandler)
  .delete(controller.canRequest("delete:review"), deleteHandler)
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

  const { slug, page, limit } = parsedQuery.data;

  const result = await review.getPaginatedReviewsBySlug(slug, page, limit);

  const filteredReviews = result.reviews.map((r) =>
    authorization.filterOutput(req.context?.user || {}, "read:review", r),
  );

  return res.status(200).json({
    reviews: filteredReviews,
    pagination: result.pagination,
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userTryingToReview = req.context?.user;

  if (!userTryingToReview?.id) {
    throw new ValidationError({
      message: "User ID is missing.",
      action: "You must be logged in to post a review.",
    });
  }

  const parsedBody = postBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new ValidationError({
      message: "Request body validation failed.",
      action: "Provide slug, message, and recommended boolean.",
      cause: parsedBody.error,
    });
  }

  const { slug, message, recommended } = parsedBody.data;

  await review.add(userTryingToReview.id, slug, message, recommended);

  return res.status(201).json({ message: "Review posted successfully" });
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const userTryingToReview = req.context?.user;

  if (!userTryingToReview?.id) {
    throw new ValidationError({
      message: "User ID is missing.",
      action: "You must be logged in to delete a review.",
    });
  }

  const parsedBody = bodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new ValidationError({
      message: "Request body validation failed.",
      action: "Provide the 'slug' in the request body.",
      cause: parsedBody.error,
    });
  }

  const { slug } = parsedBody.data;

  await review.remove(userTryingToReview.id, slug);

  return res.status(200).json({ message: "Review deleted successfully" });
}
