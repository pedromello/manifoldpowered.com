import type { SteamRefresh } from "generated/prisma/client";
import {
  createExternalRefreshCoordinator,
  type ExternalRefreshRepository,
} from "models/external_refresh";

export { REFRESH_INTERVAL_MS } from "models/external_refresh";

const repository: ExternalRefreshRepository<string, SteamRefresh, string> = {
  async resolve(tx, steamAppId) {
    return {
      identity: steamAppId,
      game: await tx.game.findUnique({ where: { steam_app_id: steamAppId } }),
    };
  },
  findByIdentity(tx, steamAppId) {
    return tx.steamRefresh.findUnique({ where: { steam_app_id: steamAppId } });
  },
  findById(tx, id) {
    return tx.steamRefresh.findUnique({ where: { id } });
  },
  ensure(tx, { identity: steamAppId, game }) {
    return tx.steamRefresh.upsert({
      where: { steam_app_id: steamAppId },
      create: { steam_app_id: steamAppId, game_id: game?.id },
      update: {},
    });
  },
  countActive(tx, now) {
    return tx.steamRefresh.count({ where: { lease_expires_at: { gt: now } } });
  },
  acquire(tx, row, game, data) {
    return tx.steamRefresh.update({
      where: { id: row.id },
      data: { ...data, game_id: game?.id },
    });
  },
  complete(tx, row, gameId, data) {
    return tx.steamRefresh.update({
      where: { id: row.id },
      data: { ...data, game_id: gameId },
    });
  },
  async failOwned(tx, ownership, data) {
    await tx.steamRefresh.updateMany({ where: ownership, data });
  },
  gameForRow(tx, row) {
    return tx.game.findUnique({ where: { steam_app_id: row.steam_app_id } });
  },
};

const coordinator = createExternalRefreshCoordinator({
  label: "Steam",
  lockName: "steam-refresh-coordination",
  repository,
});

export const { reserve, fence, complete, fail, failure, metadata, status } =
  coordinator;
export const statusForApp = coordinator.statusForReference;
