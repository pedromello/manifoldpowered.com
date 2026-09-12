import type { User } from "generated/prisma/client";
import { outletEditorialResponseSchema } from "contracts/outlet-rating";
import authorization from "models/authorization";
import storeGameEditorial from "models/store_game_editorial";

type Editorial = Parameters<typeof storeGameEditorial.toPublicReview>[0];

/** Keep editorial enrichment behind the same output boundary as game data. */
export function filterStorefrontEditorial(
  user: Partial<User>,
  review?: Editorial | null,
) {
  const filtered = authorization.filterOutput(user, "read:public_game", {
    review: review ? storeGameEditorial.toPublicReview(review) : null,
  });
  return outletEditorialResponseSchema.parse(filtered).review;
}
