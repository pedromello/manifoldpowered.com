import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import { z } from "zod";
import { createHash } from "node:crypto";

export const OWNERSHIP_RIGHTS_TERMS_VERSION = "game-ownership-rights-v1";

const OWNERSHIP_RIGHTS_TERMS = {
  en: ({ gameTitle, studioName }: TermsInterpolation) =>
    `I declare that I represent the studio “${studioName}” and that it possesses the rights and authorizations necessary to distribute, publish, and sell the specific game “${gameTitle}” on Manifold. I understand that false or misleading statements may be rejected and may result in restrictions on the account or studio.`,
  "pt-BR": ({ gameTitle, studioName }: TermsInterpolation) =>
    `Declaro que represento o estúdio “${studioName}” e que ele possui os direitos e autorizações necessários para distribuir, publicar e vender o jogo específico “${gameTitle}” na Manifold. Entendo que declarações falsas ou enganosas podem ser rejeitadas e resultar em restrições à conta ou ao estúdio.`,
} as const;

interface TermsInterpolation {
  gameTitle: string;
  studioName: string;
}

export type OwnershipRightsTermsLocale = keyof typeof OWNERSHIP_RIGHTS_TERMS;

export const createOwnershipClaimSchema = z
  .object({
    studio_id: z.uuid(),
    accepted_rights_terms: z.literal(true),
    terms_locale: z.enum(["en", "pt-BR"]),
    terms_version: z.literal(OWNERSHIP_RIGHTS_TERMS_VERSION),
    terms_digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const ownershipClaimLocaleQuerySchema = z
  .object({
    slug: z.string().min(1).max(255),
    studio_id: z.uuid(),
    locale: z.enum(["en", "pt-BR"]).default("en"),
  })
  .strict();

export const ownershipClaimRouteQuerySchema = z
  .object({ slug: z.string().min(1).max(255) })
  .strict();

export const ownershipClaimDecisionRouteQuerySchema = z
  .object({ claim_id: z.uuid() })
  .strict();

export const ownershipClaimAdminQuerySchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    game_id: z.uuid().optional(),
    studio_id: z.uuid().optional(),
  })
  .strict();

export const decideOwnershipClaimSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((value) => value.decision !== "REJECTED" || value.reason, {
    message: "reason is required when rejecting an ownership claim",
    path: ["reason"],
  });

export function currentOwnershipRightsTerms(
  locale: OwnershipRightsTermsLocale,
  interpolation: TermsInterpolation,
) {
  const text = OWNERSHIP_RIGHTS_TERMS[locale](interpolation);
  return {
    version: OWNERSHIP_RIGHTS_TERMS_VERSION,
    locale,
    text,
    digest: createHash("sha256").update(text, "utf8").digest("hex"),
  };
}

type ClaimRow = Awaited<
  ReturnType<typeof prisma.gameOwnershipClaim.findUniqueOrThrow>
>;

export interface OwnershipClaimView extends ClaimRow {
  game: {
    id: string;
    slug: string;
    title: string;
    status: string;
    studio_id: string | null;
  };
  studio: { id: string; slug: string; name: string };
  requested_by: { id: string; username: string; email?: string };
  decided_by: { id: string; username: string; email?: string } | null;
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function runSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 2) throw error;
    }
  }

  throw new Error("Unreachable transaction retry state");
}

async function create({
  gameId,
  studioId,
  requestedByUserId,
  termsLocale,
  acceptedTermsVersion,
  acceptedTermsDigest,
}: {
  gameId: string;
  studioId: string;
  requestedByUserId: string;
  termsLocale: OwnershipRightsTermsLocale;
  acceptedTermsVersion: string;
  acceptedTermsDigest: string;
}) {
  try {
    const claim = await runSerializable(async (tx) => {
      // A Prisma interactive transaction uses a single database connection.
      // Keep its reads sequential: parallel client.query calls are deprecated by
      // node-postgres and will become an error in pg 9.
      const game = await tx.game.findUnique({ where: { id: gameId } });
      const studio = await tx.studio.findUnique({ where: { id: studioId } });
      const requester = await tx.user.findUnique({
        where: { id: requestedByUserId },
        select: { id: true },
      });

      if (!game) {
        throw new NotFoundError({
          message: "The requested game was not found.",
          action: "Check the game identifier and try again.",
        });
      }
      if (!studio) {
        throw new NotFoundError({
          message: "The selected studio was not found.",
          action: "Select an existing studio and try again.",
        });
      }
      if (!requester) {
        throw new NotFoundError({
          message: "The requesting user was not found.",
          action: "Sign in again and retry the request.",
        });
      }
      if (game.status !== "ONLY_DISPLAY" || game.studio_id !== null) {
        throw new ValidationError({
          message: "Only unclaimed catalog games can receive ownership claims.",
          action: "Choose a game that is visible and has not been claimed yet.",
        });
      }

      const terms = currentOwnershipRightsTerms(termsLocale, {
        gameTitle: game.title,
        studioName: studio.name,
      });
      if (
        acceptedTermsVersion !== terms.version ||
        acceptedTermsDigest !== terms.digest
      ) {
        throw new ValidationError({
          message:
            "The ownership rights terms have changed since they were displayed.",
          action:
            "Reload the terms, review them, and accept the current version.",
        });
      }

      return tx.gameOwnershipClaim.create({
        data: {
          game_id: gameId,
          studio_id: studioId,
          requested_by_user_id: requestedByUserId,
          rights_attestation_text: terms.text,
          rights_attestation_version: terms.version,
          rights_attestation_locale: terms.locale,
          rights_attested_at: new Date(),
        },
      });
    });

    return enrichOne(claim);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message:
          "This studio already has a pending ownership claim for the game.",
        action:
          "Wait for the current request to be reviewed before trying again.",
        cause: error,
      });
    }
    throw error;
  }
}

async function enrichOne(claim: ClaimRow): Promise<OwnershipClaimView> {
  const [enriched] = await enrichMany([claim]);
  if (!enriched) {
    throw new NotFoundError({
      message: "The ownership claim was not found.",
      action: "Check the claim identifier and try again.",
    });
  }
  return enriched;
}

async function enrichMany(claims: ClaimRow[]): Promise<OwnershipClaimView[]> {
  if (claims.length === 0) return [];
  const userIds = [
    ...new Set(
      claims.flatMap((claim) =>
        claim.decided_by_user_id
          ? [claim.requested_by_user_id, claim.decided_by_user_id]
          : [claim.requested_by_user_id],
      ),
    ),
  ];
  const [games, studios, users] = await Promise.all([
    prisma.game.findMany({
      where: { id: { in: claims.map((claim) => claim.game_id) } },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        studio_id: true,
      },
    }),
    prisma.studio.findMany({
      where: { id: { in: claims.map((claim) => claim.studio_id) } },
      select: { id: true, slug: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    }),
  ]);
  const gameById = new Map(games.map((game) => [game.id, game]));
  const studioById = new Map(studios.map((studio) => [studio.id, studio]));
  const userById = new Map(users.map((user) => [user.id, user]));

  return claims.map((claim) => {
    const game = gameById.get(claim.game_id);
    const studio = studioById.get(claim.studio_id);
    const requester = userById.get(claim.requested_by_user_id);
    const decider = claim.decided_by_user_id
      ? (userById.get(claim.decided_by_user_id) ?? null)
      : null;
    if (!game || !studio || !requester) {
      throw new NotFoundError({
        message:
          "An ownership claim references a resource that no longer exists.",
        action: "Contact support to repair the ownership claim.",
      });
    }
    return {
      ...claim,
      game,
      studio,
      requested_by: requester,
      decided_by: decider,
    };
  });
}

async function findForStudios(gameId: string, studioIds: string[]) {
  if (studioIds.length === 0) return [];
  const claims = await prisma.gameOwnershipClaim.findMany({
    where: { game_id: gameId, studio_id: { in: studioIds } },
    orderBy: { created_at: "desc" },
  });
  return enrichMany(claims);
}

async function findAllPaginatedAdmin({
  page = 1,
  limit = 20,
  status,
  game_id,
  studio_id,
}: {
  page?: number;
  limit?: number;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  game_id?: string;
  studio_id?: string;
}) {
  const where: Prisma.GameOwnershipClaimWhereInput = {
    status,
    game_id,
    studio_id,
  };
  const [claims, total] = await Promise.all([
    prisma.gameOwnershipClaim.findMany({
      where,
      orderBy: { created_at: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.gameOwnershipClaim.count({ where }),
  ]);

  return {
    claims: await enrichMany(claims),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function decide({
  claimId,
  adminUserId,
  decision,
  reason,
}: {
  claimId: string;
  adminUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}) {
  const decidedClaim = await runSerializable(async (tx) => {
    const claim = await tx.gameOwnershipClaim.findUnique({
      where: { id: claimId },
    });
    const admin = await tx.user.findUnique({
      where: { id: adminUserId },
      select: { id: true },
    });

    if (!claim) {
      throw new NotFoundError({
        message: "The ownership claim was not found.",
        action: "Check the claim identifier and try again.",
      });
    }
    if (!admin) {
      throw new NotFoundError({
        message: "The deciding administrator was not found.",
        action: "Sign in again and retry the decision.",
      });
    }
    if (claim.status !== "PENDING") {
      if (claim.status === decision) return claim;
      throw new ValidationError({
        message: `This ownership claim has already been ${claim.status.toLowerCase()}.`,
        action: "Reload the claim queue before making another decision.",
      });
    }

    if (decision === "APPROVED") {
      const assigned = await tx.game.updateMany({
        where: { id: claim.game_id, status: "ONLY_DISPLAY", studio_id: null },
        data: { studio_id: claim.studio_id },
      });
      if (assigned.count !== 1) {
        throw new ValidationError({
          message: "The game is no longer eligible for this ownership claim.",
          action: "Reload the claim queue to see the current owner.",
        });
      }

      const decidedAt = new Date();
      const competingClaims = await tx.gameOwnershipClaim.findMany({
        where: {
          game_id: claim.game_id,
          status: "PENDING",
          id: { not: claim.id },
        },
        select: { id: true },
      });
      const approved = await tx.gameOwnershipClaim.update({
        where: { id: claim.id },
        data: {
          status: "APPROVED",
          decided_by_user_id: adminUserId,
          decided_at: decidedAt,
          decision_reason: reason,
        },
      });
      await tx.gameOwnershipClaim.updateMany({
        where: {
          game_id: claim.game_id,
          status: "PENDING",
          id: { not: claim.id },
        },
        data: {
          status: "REJECTED",
          decided_by_user_id: adminUserId,
          decided_at: decidedAt,
          decision_reason:
            "Another ownership claim for this game was approved.",
        },
      });
      await tx.adminActionLog.create({
        data: {
          admin_user_id: adminUserId,
          action: "game_ownership_claim:approve",
          target_type: "game_ownership_claim",
          target_id: claim.id,
          reason,
          metadata: {
            game_id: claim.game_id,
            studio_id: claim.studio_id,
            auto_rejected_claim_ids: competingClaims.map(
              (competingClaim) => competingClaim.id,
            ),
          },
        },
      });
      return approved;
    }

    const rejected = await tx.gameOwnershipClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        decided_by_user_id: adminUserId,
        decided_at: new Date(),
        decision_reason: reason,
      },
    });
    await tx.adminActionLog.create({
      data: {
        admin_user_id: adminUserId,
        action: "game_ownership_claim:reject",
        target_type: "game_ownership_claim",
        target_id: claim.id,
        reason,
        metadata: { game_id: claim.game_id, studio_id: claim.studio_id },
      },
    });
    return rejected;
  });

  return enrichOne(decidedClaim);
}

const gameOwnershipClaim = {
  create,
  currentOwnershipRightsTerms,
  decide,
  findAllPaginatedAdmin,
  findForStudios,
};

export default gameOwnershipClaim;
