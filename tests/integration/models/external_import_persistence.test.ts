import { prisma } from "infra/database";
import type { Prisma } from "generated/prisma/client";
import { createStorePersistence } from "models/external_import/persistence";
import type { StoreSnapshot } from "models/external_import/contracts";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test.each([
  { decision: "moderation", change: { status: "INACTIVE" } },
  {
    decision: "ownership approval",
    change: { studio_id: "7d9ab2fa-8cf1-4207-86c9-cf1b040fd6b3" },
  },
] as const)(
  "$decision between the eligibility read and update prevents all imported writes",
  async ({ change }) => {
    const previous = await prisma.game.create({
      data: {
        title: "Protected title",
        slug: "protected-steam-game",
        description: "Protected description",
        detailed_description: "Protected details",
        developer_name: "Protected developer",
        price: 0,
        status: "ONLY_DISPLAY",
        steam_app_id: "990000800",
        meta_tags: { features: { single_player: true } },
      },
    });
    const snapshot: StoreSnapshot = {
      externalId: previous.steam_app_id!,
      suggestedSlug: "replacement-slug",
      fields: {
        title: "Upstream replacement",
        description: "Replacement description",
        detailed_description: "Replacement details",
        launch_date: null,
        developer_name: "Replacement developer",
        publisher_name: null,
        tags: [],
        meta_tags: { features: { multiplayer: true } },
        media: {},
      },
      localizations: [
        {
          locale: "pt-BR",
          title: "Replacement localization",
          description: "Replacement description",
          detailed_description: "Replacement details",
        },
      ],
      offers: [
        {
          country: "BR",
          currency: "BRL",
          url: "https://store.steampowered.com/app/990000800/",
          amount: "50",
          original_amount: "100",
          discount_percent: 50,
          captured_at: new Date(),
        },
      ],
    };
    const persist = createStorePersistence({
      source: "STEAM",
      identity: (steam_app_id) => ({ steam_app_id }),
      canRefresh: (game) =>
        game.status === "ONLY_DISPLAY" && game.studio_id === null,
      updateCondition: { status: "ONLY_DISPLAY", studio_id: null },
      fallbackLocales: ["pt-BR"],
      fallbackOnRefresh: false,
      createUnknownOffersOnRefresh: false,
    });

    let intervened = false;
    await prisma.$transaction(async (tx) => {
      const gameDelegate = new Proxy(tx.game, {
        get(target, property, receiver) {
          if (property !== "findUnique")
            return Reflect.get(target, property, receiver);
          return async (args: Prisma.GameFindUniqueArgs) => {
            const observed = await target.findUnique(args);
            if (!intervened && observed?.id === previous.id) {
              // Deterministically reproduce an intervening decision while
              // returning the stale eligible row to the persistence service.
              await target.update({ where: { id: previous.id }, data: change });
              intervened = true;
            }
            return observed;
          };
        },
      });
      const transaction = new Proxy(tx, {
        get(target, property, receiver) {
          return property === "game"
            ? gameDelegate
            : Reflect.get(target, property, receiver);
        },
      });
      await expect(persist(transaction, snapshot)).rejects.toMatchObject({
        code: "P2025",
      });
    });

    expect(intervened).toBe(true);
    expect(
      await prisma.game.findUniqueOrThrow({ where: { id: previous.id } }),
    ).toMatchObject({
      ...change,
      title: previous.title,
      slug: previous.slug,
      description: previous.description,
      meta_tags: previous.meta_tags,
    });
    expect(await prisma.gameExternalOffer.count()).toBe(0);
    expect(await prisma.gameLocalization.count()).toBe(0);
  },
);
