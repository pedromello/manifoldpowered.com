import { NextApiRequest } from "next";
import { Game } from "generated/prisma/client";
import authorization from "models/authorization";
import pricing, { DisplayPrice } from "models/pricing";
import region from "models/region";
import externalOffer from "models/external_offer";
import type { GameExternalOffer } from "generated/prisma/client";
import type { GameLocalization } from "generated/prisma/client";
import gameLocalization from "models/game_localization";
import type { AppLocale } from "lib/locale";

// Everything a storefront read needs to price its results for the visitor,
// resolved once per request. Kept in one place because seven read endpoints
// need identical behaviour, and a storefront that prices games differently
// depending on which list they came from is worse than one that never
// localises at all.

export interface StorefrontPricingContext {
  currency: string;
  displayPrices: Map<string, DisplayPrice>;
  externalOffers: Map<string, GameExternalOffer>;
  localizations: Map<string, GameLocalization>;
  locale: AppLocale;
}

// The id constraint to apply to the query, so unpriceable games never enter the
// result set and pagination stays honest. Null means "no constraint needed".
async function idConstraintForRequest(req: NextApiRequest) {
  const currency = await region.currencyForRequest(req);
  const locale = gameLocalization.localeForRequest(req);

  return {
    currency,
    locale,
    gameIds: await pricing.priceableGameIdConstraint(currency),
  };
}

async function contextFor(
  currency: string,
  games: Pick<Game, "id" | "price" | "base_price">[],
  req?: NextApiRequest,
): Promise<StorefrontPricingContext> {
  const externalOfferCurrency = req
    ? region.currencyCodeForCountry(region.externalOfferCountryFromRequest(req))
    : currency;
  const locale = req ? gameLocalization.localeForRequest(req) : "en";

  return {
    currency,
    displayPrices: await pricing.displayPricesFor(games, currency),
    externalOffers: await externalOffer.regionalSteamOffers(
      games.map((game) => game.id),
      externalOfferCurrency,
    ),
    localizations: await gameLocalization.forGames(
      games.map((game) => game.id),
      locale,
    ),
    locale,
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
    .filter(
      (game) =>
        game.status === "ONLY_DISPLAY" || context.displayPrices.has(game.id),
    )
    .map((game) => {
      const localizedGame = gameLocalization.apply(
        game,
        context.localizations.get(game.id),
      );
      const regionalOffer = context.externalOffers.get(game.id);
      const gameWithRegionalOffer = regionalOffer
        ? {
            ...localizedGame,
            steam_price: regionalOffer.amount,
            steam_original_price: regionalOffer.original_amount,
            steam_discount_percent: regionalOffer.discount_percent,
            steam_price_currency: regionalOffer.currency,
            steam_price_captured_at: regionalOffer.captured_at,
          }
        : localizedGame;

      return {
        ...authorization.filterOutput(
          user,
          "read:public_game",
          gameWithRegionalOffer,
        ),
        display_price:
          game.status === "ONLY_DISPLAY"
            ? null
            : context.displayPrices.get(game.id),
      };
    });
}

const storefrontPricing = {
  idConstraintForRequest,
  contextFor,
  filterAndPrice,
};

export default storefrontPricing;
