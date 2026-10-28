import type { PlayStationRefresh } from "generated/prisma/client";
import {
  createExternalRefreshCoordinator,
  type ExternalRefreshRepository,
} from "models/external_refresh";

export { REFRESH_INTERVAL_MS } from "models/external_refresh";

const repository: ExternalRefreshRepository<
  string,
  PlayStationRefresh,
  string
> = {
  async resolve(tx, productId) {
    return {
      identity: productId,
      game: await tx.game.findUnique({
        where: { playstation_product_id: productId },
      }),
    };
  },
  findByIdentity(tx, productId) {
    return tx.playStationRefresh.findUnique({
      where: { product_id: productId },
    });
  },
  findById(tx, id) {
    return tx.playStationRefresh.findUnique({ where: { id } });
  },
  ensure(tx, { identity: productId, game }) {
    return tx.playStationRefresh.upsert({
      where: { product_id: productId },
      create: { product_id: productId, game_id: game?.id },
      update: {},
    });
  },
  countActive(tx, now) {
    return tx.playStationRefresh.count({
      where: { lease_expires_at: { gt: now } },
    });
  },
  acquire(tx, row, game, data) {
    return tx.playStationRefresh.update({
      where: { id: row.id },
      data: { ...data, game_id: game?.id },
    });
  },
  complete(tx, row, gameId, data) {
    return tx.playStationRefresh.update({
      where: { id: row.id },
      data: { ...data, game_id: gameId },
    });
  },
  async failOwned(tx, ownership, data) {
    await tx.playStationRefresh.updateMany({ where: ownership, data });
  },
  gameForRow(tx, row) {
    return tx.game.findUnique({
      where: { playstation_product_id: row.product_id },
    });
  },
};

const coordinator = createExternalRefreshCoordinator({
  label: "PlayStation",
  lockName: "playstation-refresh-coordination",
  repository,
});

export const { reserve, fence, complete, fail, failure, metadata, status } =
  coordinator;
export const statusForProduct = coordinator.statusForReference;
