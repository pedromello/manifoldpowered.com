import { prisma } from "infra/database";
import gameModel from "models/game";
import storeCuration from "models/store_curation";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function activeGame(ownerId: string, title: string) {
  const game = await orchestrator.createGame(ownerId, { title });
  await gameModel.makePublic(game.id);
  return game;
}

describe("creator selection transactions", () => {
  test("atomically initializes a pristine handpicked selection", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      status: "DRAFT",
      catalog_mode: "UNDECIDED",
    });
    const games: Awaited<ReturnType<typeof activeGame>>[] = [];
    for (let index = 1; index <= 5; index += 1) {
      games.push(await activeGame(owner.id, `Creator Selection ${index}`));
    }

    await expect(
      storeCuration.replaceCreatorSelection(store.id, {
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: games.map((game) => game.slug),
        expected_draft_revision: 1,
      }),
    ).resolves.toMatchObject({
      strategy: "HANDPICKED",
      catalog_mode: "SELECTED",
      catalog_game_count: 5,
      draft_revision: 2,
    });

    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ catalog_mode: "SELECTED", draft_revision: 2 });
    expect(
      await prisma.storeTagFilter.count({ where: { store_id: store.id } }),
    ).toBe(0);
    expect(
      await prisma.storeGameOverride.count({
        where: { store_id: store.id, visibility: "SHOW" },
      }),
    ).toBe(5);
  });

  test("rejects stale CAS without partial catalog writes", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      status: "DRAFT",
      catalog_mode: "UNDECIDED",
    });
    await prisma.store.update({
      where: { id: store.id },
      data: { draft_revision: 2 },
    });

    await expect(
      storeCuration.replaceCreatorSelection(store.id, {
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: ["one", "two", "three", "four", "five"],
        expected_draft_revision: 1,
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });

    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ catalog_mode: "UNDECIDED", draft_revision: 2 });
    expect(
      await prisma.storeTagFilter.count({ where: { store_id: store.id } }),
    ).toBe(0);
    expect(
      await prisma.storeGameOverride.count({ where: { store_id: store.id } }),
    ).toBe(0);
  });

  test("fails closed instead of replacing existing curation", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      status: "DRAFT",
      catalog_mode: "UNDECIDED",
    });
    await prisma.storeTagFilter.create({
      data: { store_id: store.id, tag: "rpg", mode: "WHITELIST" },
    });

    await expect(
      storeCuration.replaceCreatorSelection(store.id, {
        strategy: "FOCUSED",
        tags: ["Strategy"],
        game_slugs: [],
        expected_draft_revision: 1,
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });

    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ catalog_mode: "UNDECIDED", draft_revision: 1 });
    expect(
      await prisma.storeTagFilter.findMany({ where: { store_id: store.id } }),
    ).toEqual([expect.objectContaining({ tag: "rpg", mode: "WHITELIST" })]);
    expect(
      await prisma.storeGameOverride.count({ where: { store_id: store.id } }),
    ).toBe(0);
  });
});
