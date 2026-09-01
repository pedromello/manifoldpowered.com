import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import game from "models/game";
import gameOwnershipClaim, {
  createOwnershipClaimSchema,
  currentOwnershipRightsTerms,
  ownershipClaimLocaleQuerySchema,
  ownershipClaimRouteQuerySchema,
} from "models/game_ownership_claim";
import studio from "models/studio";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(getHandler)
  .post(controller.canRequest("create:game_ownership_claim"), postHandler)
  .handler(controller.errorHandlers);

async function resolveResources(slug: string, studioId: string) {
  const [foundGame, foundStudio] = await Promise.all([
    game.findOneBySlug(slug),
    studio.findOneByIdWithMembers(studioId),
  ]);
  if (!foundGame) {
    throw new NotFoundError({
      message: `The game with slug "${slug}" was not found.`,
      action: "Check the game slug and try again.",
    });
  }
  return { foundGame, foundStudio };
}

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsed = ownershipClaimLocaleQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError({
      message: "Invalid ownership claim query parameters.",
      action: "Provide a valid studio_id and locale.",
      context: parsed.error.issues,
    });
  }

  const { foundGame, foundStudio } = await resolveResources(
    parsed.data.slug,
    parsed.data.studio_id,
  );
  const canReadClaims = authorization.can(
    req.context.user,
    "read:game_ownership_claim",
    foundStudio,
  );
  const canCreateClaims = authorization.can(
    req.context.user,
    "create:game_ownership_claim",
    foundStudio,
  );
  if (!canReadClaims && !canCreateClaims) {
    throw new ForbiddenError({
      message: "You cannot access ownership claims for this studio.",
      action:
        "Choose a studio that you own or represent with claim permissions.",
    });
  }

  // Creation permission must be sufficient to retrieve the exact declaration
  // required by POST, but it must not implicitly grant access to claim history.
  const claims = canReadClaims
    ? await gameOwnershipClaim.findForStudios(foundGame.id, [foundStudio.id])
    : [];
  return res.status(200).json({
    claims: claims.map((claim) =>
      authorization.filterOutput(
        req.context.user,
        "read:game_ownership_claim",
        claim,
      ),
    ),
    current_terms: currentOwnershipRightsTerms(parsed.data.locale, {
      gameTitle: foundGame.title,
      studioName: foundStudio.name,
    }),
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const query = ownershipClaimRouteQuerySchema.safeParse(req.query);
  if (!query.success) {
    throw new ValidationError({
      message: "Invalid game identifier.",
      action: "Check the game slug and try again.",
      context: query.error.issues,
    });
  }
  const parsed = createOwnershipClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError({
      message: "Invalid ownership claim payload.",
      action:
        "Select a studio and explicitly accept the displayed rights terms.",
      context: parsed.error.issues,
    });
  }

  const { foundGame, foundStudio } = await resolveResources(
    query.data.slug,
    parsed.data.studio_id,
  );
  if (
    !authorization.can(
      req.context.user,
      "create:game_ownership_claim",
      foundStudio,
    )
  ) {
    throw new ForbiddenError({
      message: "You cannot submit ownership claims for this studio.",
      action:
        "Choose a studio that you own or represent with claim permissions.",
    });
  }

  const claim = await gameOwnershipClaim.create({
    gameId: foundGame.id,
    studioId: foundStudio.id,
    requestedByUserId: req.context.user.id as string,
    termsLocale: parsed.data.terms_locale,
    acceptedTermsVersion: parsed.data.terms_version,
    acceptedTermsDigest: parsed.data.terms_digest,
  });
  return res.status(201).json({
    claim: authorization.filterOutput(
      req.context.user,
      "create:game_ownership_claim",
      claim,
    ),
  });
}
