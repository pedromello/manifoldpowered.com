import { prisma } from "infra/database";
import playstation from "infra/playstation";
import * as playstationRefresh from "models/playstation_refresh";
import {
  createPlayStationStrategy,
  type PlayStationGateway,
  type PlayStationReference,
} from "./playstation_strategy";
import steam from "infra/steam";
import nintendo from "infra/nintendo";
import type {
  Game,
  Prisma,
  SteamRefresh,
  NintendoRefresh,
} from "generated/prisma/client";
import type { ExternalStoreProvider } from "lib/external_stores";
import * as steamRefresh from "models/steam_refresh";
import * as nintendoRefresh from "models/nintendo_refresh";
import { createImportAttempts } from "./attempts";
import { createStorePersistence } from "./persistence";
import { createStoreImportService } from "./service";
import {
  createSteamStrategy,
  type SteamDetailsGateway,
} from "./steam_strategy";
import {
  createNintendoStrategy,
  type NintendoGateway,
  type NintendoReference,
} from "./nintendo_strategy";

const transaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(work, { maxWait: 15000, timeout: 15000 });
const steamCanRefresh = (game: Game) =>
  game.status === "ONLY_DISPLAY" && game.studio_id === null;

const steamAttempts = createImportAttempts<string>({
  label: "Steam",
  userLock: (userId) => userId,
  count: (tx, userId, since) =>
    tx.steamImportAttempt.count({
      where: { user_id: userId, created_at: { gte: since } },
    }),
  create: (tx, userId, steamAppId) =>
    tx.steamImportAttempt.create({
      data: { user_id: userId, steam_app_id: steamAppId },
    }),
  async finish(id, outcome, audit) {
    await prisma.steamImportAttempt.update({
      where: { id },
      data: {
        outcome,
        ...(audit?.descriptorIds
          ? {
              content_descriptor_ids: audit.descriptorIds,
              content_descriptors_present: audit.descriptorsPresent,
            }
          : {}),
      },
    });
  },
});
const nintendoAttempts = createImportAttempts<NintendoReference>({
  label: "Nintendo",
  userLock: (userId) => `nintendo-user:${userId}`,
  count: (tx, userId, since) =>
    tx.nintendoImportAttempt.count({
      where: { user_id: userId, created_at: { gte: since } },
    }),
  create: (tx, userId, input) =>
    tx.nintendoImportAttempt.create({
      data: { user_id: userId, url: input.url },
    }),
  async finish(id, outcome, audit, error) {
    await prisma.nintendoImportAttempt.update({
      where: { id },
      data: {
        outcome:
          error === undefined
            ? outcome
            : error instanceof Error
              ? error.name.slice(0, 32)
              : "ServiceError",
        ...(audit ? { regional_outcomes: audit.regionalOutcomes } : {}),
      },
    });
  },
});

const steamPersistence = createStorePersistence({
  source: "STEAM",
  identity: (steam_app_id) => ({ steam_app_id }),
  canRefresh: steamCanRefresh,
  updateCondition: { status: "ONLY_DISPLAY", studio_id: null },
  fallbackLocales: ["pt-BR"],
  fallbackOnRefresh: false,
  createUnknownOffersOnRefresh: false,
  legacyPrices(snapshot, previous) {
    const price = snapshot.primaryPrice;
    if (!price || (previous && price.amount === null)) return {};
    return {
      steam_price: price.amount,
      steam_original_price: price.original_amount,
      steam_discount_percent: price.discount_percent,
      steam_price_currency: price.currency,
      steam_price_captured_at: price.captured_at,
    };
  },
});
const nintendoPersistence = createStorePersistence({
  source: "NINTENDO",
  preserveVideosWhenMissing: true,
  identity: (nintendo_nsuid) => ({ nintendo_nsuid }),
  lock: (tx, nsuid) =>
    tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`nintendo-game:${nsuid}`}))) AS game_lock`,
  canRefresh: () => true,
  fallbackLocales: ["en", "pt-BR"],
  fallbackOnRefresh: true,
  createUnknownOffersOnRefresh: true,
});

const playstationAttempts = createImportAttempts<PlayStationReference>({
  label: "PlayStation",
  userLock: (userId) => `playstation-user:${userId}`,
  count: (tx, userId, since) =>
    tx.playStationImportAttempt.count({
      where: { user_id: userId, created_at: { gte: since } },
    }),
  create: (tx, userId, input) =>
    tx.playStationImportAttempt.create({
      data: { user_id: userId, product_id: input.productId },
    }),
  async finish(id, outcome, audit) {
    await prisma.playStationImportAttempt.update({
      where: { id },
      data: {
        outcome,
        ...(audit ? { regional_outcomes: audit.regionalOutcomes } : {}),
      },
    });
  },
});
const playstationPersistence = createStorePersistence({
  source: "PLAYSTATION",
  identity: (playstation_product_id) => ({ playstation_product_id }),
  lock: (tx, id) =>
    tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`playstation-game:${id}`}))) AS game_lock`,
  canRefresh: (game) =>
    game.status === "ONLY_DISPLAY" && game.studio_id === null,
  updateCondition: { status: "ONLY_DISPLAY", studio_id: null },
  fallbackLocales: ["en", "pt-BR"],
  fallbackOnRefresh: true,
  createUnknownOffersOnRefresh: true,
  preserveVideosWhenMissing: true,
});

/** Composition root: register a source strategy and its existing storage adapters here. */
export const storeImporters = {
  playstation(gateway: PlayStationGateway = playstation) {
    return createStoreImportService<
      PlayStationReference,
      import("generated/prisma/client").PlayStationRefresh,
      Prisma.TransactionClient
    >({
      label: "PlayStation",
      strategy: createPlayStationStrategy(gateway),
      attempts: playstationAttempts,
      managedGame: async () => null,
      coordination: {
        ...playstationRefresh,
        reserve: (input) => playstationRefresh.reserve(input.productId),
        complete: (tx, row, game, outcomes) =>
          playstationRefresh.complete(tx, row, game.id, outcomes),
      },
      transaction,
      persist: playstationPersistence,
    });
  },
  steam(gateway: SteamDetailsGateway = steam) {
    return createStoreImportService<
      string,
      SteamRefresh,
      Prisma.TransactionClient
    >({
      label: "Steam",
      strategy: createSteamStrategy(gateway),
      attempts: steamAttempts,
      async managedGame(reference) {
        const game = await prisma.game.findUnique({
          where: { steam_app_id: reference },
        });
        return game && !steamCanRefresh(game) ? game : null;
      },
      coordination: {
        ...steamRefresh,
        complete: (tx, row, game, outcomes) =>
          steamRefresh.complete(tx, row, game.id, outcomes),
      },
      transaction,
      persist: steamPersistence,
    });
  },
  nintendo(gateway: NintendoGateway = nintendo) {
    return createStoreImportService<
      NintendoReference,
      NintendoRefresh,
      Prisma.TransactionClient
    >({
      label: "Nintendo",
      strategy: createNintendoStrategy(gateway),
      attempts: nintendoAttempts,
      managedGame: async () => null,
      coordination: {
        ...nintendoRefresh,
        reserve: (reference) =>
          nintendoRefresh.reserve(reference.slug, reference.country),
        complete: (tx, row, game, outcomes, reference) =>
          nintendoRefresh.complete(
            tx,
            row,
            game,
            outcomes,
            reference.slug,
            reference.country,
          ),
      },
      transaction,
      persist: nintendoPersistence,
    });
  },
} satisfies Record<
  ExternalStoreProvider,
  () => ReturnType<typeof createStoreImportService>
>;
