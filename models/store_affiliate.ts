import { randomUUID } from "node:crypto";
import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ConflictError, NotFoundError, ValidationError } from "infra/errors";
import { isTransactionWriteConflict } from "lib/transaction-conflict";
import {
  AFFILIATE_PLATFORMS,
  EMPTY_AFFILIATE_SNAPSHOT,
  affiliateSnapshotSchema,
  resolveAffiliateLinks,
  type AffiliateLink,
  type AffiliateLinkInput,
  type AffiliatePlatform,
  type AffiliateSnapshot,
} from "contracts/outlet-affiliates";

type AffiliateClient = Pick<
  Prisma.TransactionClient,
  "store" | "storeGameAffiliateLink" | "game"
>;

export function parseAffiliateSnapshot(value: unknown): AffiliateSnapshot {
  return affiliateSnapshotSchema.parse(value ?? EMPTY_AFFILIATE_SNAPSHOT);
}

export async function getDraftAffiliateSnapshot(
  storeId: string,
  client: AffiliateClient = prisma,
): Promise<AffiliateSnapshot> {
  const [outlet, rows] = await Promise.all([
    client.store.findUnique({
      where: { id: storeId },
      select: { affiliate_settings: true },
    }),
    client.storeGameAffiliateLink.findMany({
      where: { store_id: storeId },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!outlet) throw missingOutlet();
  const games = rows.length
    ? await client.game.findMany({
        where: { id: { in: rows.map((row) => row.game_id) } },
        select: { id: true, slug: true, title: true },
      })
    : [];
  const byId = new Map(games.map((game) => [game.id, game]));
  return parseAffiliateSnapshot({
    version: 1,
    links: [
      ...parseAffiliateSnapshot(outlet.affiliate_settings).links.filter(
        (link) => link.kind !== "game",
      ),
      ...rows.flatMap((row) => {
        const game = byId.get(row.game_id);
        return game
          ? [
              {
                id: row.id,
                kind: "game",
                merchant: row.merchant,
                platform: row.platform,
                media_type: row.media_type,
                country: row.country,
                game_id: row.game_id,
                game_slug: game.slug,
                game_title: game.title,
                url: row.url,
                label: row.label,
              },
            ]
          : [];
      }),
    ],
  });
}

function missingOutlet() {
  return new NotFoundError({
    message: "Outlet not found.",
    action: "Check the Outlet and try again.",
  });
}
function conflict(expected: number, actual: number) {
  return new ConflictError({
    message: "The Outlet draft changed before the affiliate link was saved.",
    action: "Refresh the links and try again.",
    context: {
      expected_draft_revision: expected,
      actual_draft_revision: actual,
    },
  });
}
function duplicate() {
  return new ConflictError({
    message: "An affiliate link already exists for this destination.",
    action: "Edit the existing link instead.",
  });
}
const key = (
  link: Pick<
    AffiliateLink,
    "kind" | "merchant" | "platform" | "game_id" | "media_type" | "country"
  >,
) =>
  [
    link.kind,
    link.merchant,
    link.platform,
    link.game_id,
    link.media_type,
    link.country,
  ].join(":");

async function mutate(
  storeId: string,
  expectedRevision: number,
  change: (
    client: Prisma.TransactionClient,
    links: AffiliateLink[],
  ) => Promise<void>,
) {
  try {
    return await prisma.$transaction(
      async (client) => {
        const advanced = await client.store.updateMany({
          where: { id: storeId, draft_revision: expectedRevision },
          data: { draft_revision: { increment: 1 } },
        });
        if (advanced.count !== 1) {
          const latest = await client.store.findUnique({
            where: { id: storeId },
            select: { draft_revision: true },
          });
          if (!latest) throw missingOutlet();
          throw conflict(expectedRevision, latest.draft_revision);
        }
        const draft = await getDraftAffiliateSnapshot(storeId, client);
        await change(client, draft.links);
        return { draft_revision: expectedRevision + 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw duplicate();
    if (isTransactionWriteConflict(error)) {
      const latest = await prisma.store.findUnique({
        where: { id: storeId },
        select: { draft_revision: true },
      });
      throw conflict(
        expectedRevision,
        latest?.draft_revision ?? expectedRevision,
      );
    }
    throw error;
  }
}

export async function saveAffiliateLink(
  storeId: string,
  expectedRevision: number,
  input: AffiliateLinkInput,
) {
  return mutate(storeId, expectedRevision, async (client, links) => {
    const existing = input.id
      ? links.find((link) => link.id === input.id)
      : undefined;
    if (input.id && !existing)
      throw new NotFoundError({
        message: "Affiliate link not found.",
        action: "Refresh the links and try again.",
      });
    let game: { id: string; slug: string; title: string } | null = null;
    if (input.kind === "game") {
      game = await client.game.findFirst({
        where: {
          slug: input.game_slug!,
          status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
        },
        select: { id: true, slug: true, title: true },
      });
      if (!game)
        throw new ValidationError({
          message: "Choose an available catalog game.",
          action: "Search the catalog and select a game.",
        });
    }
    const link: AffiliateLink = {
      id: existing?.id ?? randomUUID(),
      kind: input.kind,
      merchant: input.merchant,
      platform: input.platform,
      media_type: input.media_type,
      country: input.country,
      game_id: game?.id ?? null,
      game_slug: game?.slug ?? null,
      game_title: game?.title ?? null,
      url: input.url,
      label: input.label || null,
    };
    if (links.some((other) => other.id !== link.id && key(other) === key(link)))
      throw duplicate();
    if (!existing && links.length >= 500)
      throw new ValidationError({
        message: "The Outlet has reached its affiliate link limit.",
        action: "Remove an unused link before adding another.",
      });
    // A stable link ID survives edits, including a change between generic and game targets.
    if (existing?.kind === "game" && link.kind !== "game") {
      await client.storeGameAffiliateLink.deleteMany({
        where: { id: link.id, store_id: storeId },
      });
    }
    if (link.kind === "game") {
      const data = {
        store_id: storeId,
        game_id: link.game_id!,
        merchant: link.merchant,
        platform: link.platform!,
        media_type: link.media_type!,
        country: link.country,
        url: link.url,
        label: link.label,
      };
      await client.storeGameAffiliateLink.upsert({
        where: { id: link.id },
        create: { id: link.id, ...data },
        update: data,
      });
    }
    const generic = links.filter(
      (other) => other.kind !== "game" && other.id !== link.id,
    );
    if (link.kind !== "game") generic.push(link);
    await client.store.update({
      where: { id: storeId },
      data: {
        affiliate_settings: {
          version: 1,
          links: generic,
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function removeAffiliateLink(
  storeId: string,
  expectedRevision: number,
  id: string,
) {
  return mutate(storeId, expectedRevision, async (client, links) => {
    if (!links.some((link) => link.id === id))
      throw new NotFoundError({
        message: "Affiliate link not found.",
        action: "Refresh the links and try again.",
      });
    await client.storeGameAffiliateLink.deleteMany({
      where: { id, store_id: storeId },
    });
    await client.store.update({
      where: { id: storeId },
      data: {
        affiliate_settings: {
          version: 1,
          links: links.filter((link) => link.kind !== "game" && link.id !== id),
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function resolveAffiliateGameLinks(
  links: readonly AffiliateLink[],
  gameSlug: string,
) {
  const game = await prisma.game.findFirst({
    where: { slug: gameSlug, status: { in: ["ACTIVE", "ONLY_DISPLAY"] } },
    select: {
      id: true,
      slug: true,
      steam_app_id: true,
      nintendo_nsuid: true,
      playstation_product_id: true,
      social_links: true,
      external_offers: { select: { provider: true, country: true } },
    },
  });
  if (!game) return [];
  const platforms: AffiliatePlatform[] = [];
  const social = game.social_links as Record<string, unknown>;
  if (
    game.steam_app_id ||
    (typeof social.steam_page === "string" &&
      social.steam_page.trim().length > 0)
  )
    platforms.push("steam");
  if (game.nintendo_nsuid) platforms.push("nintendo");
  if (game.playstation_product_id) platforms.push("playstation");
  for (const offer of game.external_offers) {
    const provider = offer.provider.toLowerCase() as AffiliatePlatform;
    if (
      offer.country === "BR" &&
      AFFILIATE_PLATFORMS.includes(provider) &&
      !platforms.includes(provider)
    )
      platforms.push(provider);
  }
  return resolveAffiliateLinks(links, {
    id: game.id,
    slug: game.slug,
    platforms,
    primary_platform: platforms[0] ?? null,
  });
}
