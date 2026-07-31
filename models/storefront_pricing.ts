import { NextApiRequest } from "next";
import { Game } from "generated/prisma/client";
import authorization from "models/authorization";
import pricing, { DisplayPrice } from "models/pricing";
import region from "models/region";

// Everything a storefront read needs to price its results for the visitor,
// resolved once per request. Kept in one place because seven read endpoints
// need identical behaviour, and a storefront that prices games differently
// depending on which list they came from is worse than one that never
// localises at all.

export interface StorefrontPricingContext {
  currency: string;
  displayPrices: Map<string, DisplayPrice>;
}

// The id constraint to apply to the query, so unpriceable games never enter the
// result set and pagination stays honest. Null means "no constraint needed".
async function idConstraintForRequest(req: NextApiRequest) {
  const currency = await region.currencyForRequest(req);

  return {
    currency,
    gameIds: await pricing.priceableGameIdConstraint(currency),
  };
}

async function contextFor(
  currency: string,
  games: Pick<Game, "id" | "price" | "base_price">[],
): Promise<StorefrontPricingContext> {
  return {
    currency,
    displayPrices: await pricing.displayPricesFor(games, currency),
  };
}

// Filters each game through authorization and attaches display_price.
//
// `price` is left untouched as the USD base — this is additive, so a client
// that has not been updated keeps working, and one that has can render the
// local amount with the right symbol.
//
// A game with no resolvable price is dropped. The query constraint above
// normally prevents that, but a detail read has no constraint to apply, and
// dropping here means no code path can leak a game priced in the wrong
// currency.
function filterAndPrice<T extends Game>(
  user: Parameters<typeof authorization.filterOutput>[0],
  games: T[],
  context: StorefrontPricingContext,
) {
  return games
    .filter((game) => context.displayPrices.has(game.id))
    .map((game) => ({
      ...authorization.filterOutput(user, "read:public_game", game),
      display_price: context.displayPrices.get(game.id),
    }));
}

const storefrontPricing = {
  idConstraintForRequest,
  contextFor,
  filterAndPrice,
};

export default storefrontPricing;
