import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { ForbiddenError, ValidationError } from "infra/errors";
import authorization from "models/authorization";
import store from "models/store";
import { selectionSlugSchema } from "contracts/outlet-selections";

export function selectionInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ValidationError({
      message: "The selection input is invalid.",
      action: "Check the selection schema and try again.",
      context: result.error.issues,
    });
  return result.data;
}

export function selectionParams(req: NextApiRequest) {
  return selectionInput(
    z.object({
      slug: z.string().min(1).max(255),
      selectionSlug: selectionSlugSchema.optional(),
    }),
    req.query,
  );
}

export function privateSelectionResponse(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Vary", "Cookie");
}

export async function authorizeSelection(
  req: NextApiRequest,
  access: "read" | "write" | "publish",
) {
  const { slug } = selectionParams(req);
  const outlet = await store.findOneBySlugWithMembers(slug);
  const user = req.context.user;
  const allowed = (feature: string) =>
    authorization.can(user, feature) &&
    authorization.can(user, feature, outlet);
  const authorized =
    access === "read"
      ? ["update:store", "publish:store", "manage:store_featured_games"].some(
          allowed,
        )
      : allowed(access === "write" ? "update:store" : "publish:store");
  if (!user.id || !authorized)
    throw new ForbiddenError({
      message:
        "You do not have permission to access this outlet's selection drafts.",
      action:
        "Ask the outlet owner for the required editing or publication permission.",
    });
  return outlet;
}
