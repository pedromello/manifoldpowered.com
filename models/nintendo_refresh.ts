import type { NintendoRefresh, Prisma } from "generated/prisma/client";
import { nintendoProductUrl, type NintendoCountry } from "lib/nintendo";
import {
  createExternalRefreshCoordinator,
  metadata,
  type ExternalRefreshRepository,
} from "models/external_refresh";

export { REFRESH_INTERVAL_MS, metadata } from "models/external_refresh";

interface NintendoReference {
  slug: string;
  country: NintendoCountry;
}
interface NintendoCompletion extends NintendoReference {
  game: { id: string; nintendo_nsuid: string | null };
}

function mismatched(row: NintendoRefresh | null, country: NintendoCountry) {
  const outcomes = row?.regional_outcomes;
  return (
    outcomes &&
    typeof outcomes === "object" &&
    !Array.isArray(outcomes) &&
    outcomes[country] === "IDENTITY_MISMATCH"
  );
}

const repository: ExternalRefreshRepository<
  NintendoReference,
  NintendoRefresh,
  NintendoCompletion
> = {
  async resolve(tx, { slug, country }) {
    const scoped = await tx.nintendoRefresh.findUnique({
      where: { identity: `slug:${country}:${slug}` },
    });
    const alias =
      scoped ??
      (await tx.nintendoRefresh.findUnique({
        where: { identity: `slug:${slug}` },
      }));
    const exact = await tx.gameExternalOffer.findFirst({
      where: { provider: "NINTENDO", url: nintendoProductUrl(slug, country) },
    });
    const offer =
      exact ??
      (await tx.gameExternalOffer.findFirst({
        where: {
          provider: "NINTENDO",
          url: nintendoProductUrl(slug, country === "BR" ? "US" : "BR"),
        },
      }));
    const gameId =
      exact?.game_id ?? scoped?.game_id ?? offer?.game_id ?? alias?.game_id;
    const game = gameId
      ? await tx.game.findUnique({ where: { id: gameId } })
      : null;
    const identity = game?.nintendo_nsuid
      ? `nsuid:${game.nintendo_nsuid}`
      : (alias?.identity ?? `slug:${slug}`);
    const row = await tx.nintendoRefresh.findUnique({ where: { identity } });
    if (!exact && mismatched(row, country))
      return { identity: `slug:${country}:${slug}`, game: null };
    return { identity, game };
  },
  findByIdentity(tx, identity) {
    return tx.nintendoRefresh.findUnique({ where: { identity } });
  },
  findById(tx, id) {
    return tx.nintendoRefresh.findUnique({ where: { id } });
  },
  ensure(tx, { identity, game }) {
    return tx.nintendoRefresh.upsert({
      where: { identity },
      create: { identity, game_id: game?.id },
      update: {},
    });
  },
  countActive(tx, now) {
    return tx.nintendoRefresh.count({
      where: { lease_expires_at: { gt: now } },
    });
  },
  acquire(tx, row, _game, data) {
    return tx.nintendoRefresh.update({ where: { id: row.id }, data });
  },
  async complete(tx, row, { game, slug, country }, data) {
    const identity = `nsuid:${game.nintendo_nsuid}`;
    const canonical = await tx.nintendoRefresh.findUnique({
      where: { identity },
    });
    const updated = await tx.nintendoRefresh.update({
      where: { id: row.id },
      data: {
        ...data,
        ...(!canonical || canonical.id === row.id ? { identity } : {}),
        game_id: game.id,
      },
    });
    // Regional aliases may represent distinct editions; preserve the shared initial alias.
    for (const aliasIdentity of [`slug:${slug}`, `slug:${country}:${slug}`]) {
      if (updated.identity === aliasIdentity) continue;
      await tx.nintendoRefresh.upsert({
        where: { identity: aliasIdentity },
        create: {
          identity: aliasIdentity,
          game_id: game.id,
          state: "SUCCESS",
          last_completed_at: updated.last_completed_at,
          next_allowed_at: updated.next_allowed_at,
        },
        update: aliasIdentity === `slug:${slug}` ? {} : { game_id: game.id },
      });
    }
    return updated;
  },
  async failOwned(tx, ownership, data) {
    await tx.nintendoRefresh.updateMany({ where: ownership, data });
  },
  gameForRow(tx, row) {
    return row.game_id
      ? tx.game.findUnique({ where: { id: row.game_id } })
      : Promise.resolve(null);
  },
};

const coordinator = createExternalRefreshCoordinator<
  NintendoReference,
  NintendoRefresh,
  NintendoCompletion,
  NintendoCountry
>({
  label: "Nintendo",
  lockName: "nintendo-refresh-coordination",
  repository,
  failureContext: (row) => ({ refresh: metadata(row) }),
  decorateStatus(row, refresh, country) {
    if (country && row.state !== "RUNNING" && mismatched(row, country)) {
      refresh.state = "failed";
      refresh.message =
        "This region has a different Nintendo edition. Submit the link again.";
    }
  },
});

export const { fence, fail, failure, status } = coordinator;

export function reserve(slug: string, country: NintendoCountry = "BR") {
  return coordinator.reserve({ slug, country });
}

export function complete(
  tx: Prisma.TransactionClient,
  row: NintendoRefresh,
  game: NintendoCompletion["game"],
  outcomes: Record<string, string>,
  slug: string,
  country: NintendoCountry,
) {
  return coordinator.complete(tx, row, { game, slug, country }, outcomes);
}

export function statusForSlug(slug: string, country: NintendoCountry = "BR") {
  return coordinator.statusForReference({ slug, country }, country);
}
