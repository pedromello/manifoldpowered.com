import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameOwnershipClaim from "models/game_ownership_claim";
import { randomUUID } from "node:crypto";

export async function createUnclaimedGame(title = `Unclaimed ${randomUUID()}`) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return prisma.game.create({
    data: {
      title,
      slug,
      description: "Community catalog fixture",
      detailed_description: "Community catalog fixture for ownership tests",
      launch_date: new Date("2025-01-01T00:00:00.000Z"),
      status: "ONLY_DISPLAY",
      price: new Prisma.Decimal(0),
      tags: ["Indie"],
      developer_name: "Community Import",
      meta_tags: {},
      media: {},
      social_links: {},
      requirements: {},
    },
  });
}

export async function getCurrentTerms({
  slug,
  studioId,
  sessionToken,
  locale = "en",
}: {
  slug: string;
  studioId: string;
  sessionToken: string;
  locale?: "en" | "pt-BR";
}) {
  const response = await fetch(
    `${webserver.getOrigin()}/api/v1/games/${slug}/ownership-claims?studio_id=${studioId}&locale=${locale}`,
    { headers: { Cookie: `session_id=${sessionToken}` } },
  );
  const body = await response.json();
  if (response.status !== 200) {
    throw new Error(`Could not load ownership terms: ${response.status}`);
  }
  return body.current_terms as {
    version: string;
    locale: "en" | "pt-BR";
    text: string;
    digest: string;
  };
}

export async function createClaimThroughApi({
  slug,
  studioId,
  sessionToken,
  locale = "en",
}: {
  slug: string;
  studioId: string;
  sessionToken: string;
  locale?: "en" | "pt-BR";
}) {
  const terms = await getCurrentTerms({
    slug,
    studioId,
    sessionToken,
    locale,
  });
  return fetch(
    `${webserver.getOrigin()}/api/v1/games/${slug}/ownership-claims`,
    {
      method: "POST",
      headers: {
        Cookie: `session_id=${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studio_id: studioId,
        accepted_rights_terms: true,
        terms_locale: locale,
        terms_version: terms.version,
        terms_digest: terms.digest,
      }),
    },
  );
}

export async function createClaimDirect({
  gameId,
  gameTitle,
  studioId,
  studioName,
  userId,
}: {
  gameId: string;
  gameTitle: string;
  studioId: string;
  studioName: string;
  userId: string;
}) {
  const terms = gameOwnershipClaim.currentOwnershipRightsTerms("en", {
    gameTitle,
    studioName,
  });
  return gameOwnershipClaim.create({
    gameId,
    studioId,
    requestedByUserId: userId,
    termsLocale: "en",
    acceptedTermsVersion: terms.version,
    acceptedTermsDigest: terms.digest,
  });
}
