import { randomUUID } from "crypto";

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

describe("store curation transactions", () => {
  test("legacy singular mutations resolve the current revision and still bump exactly once", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    const game = await activeGame(owner.id, "Optional CAS Game");

    await storeCuration.addTagFilter(store.id, "rpg", "WHITELIST", undefined);
    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ draft_revision: 2 });

    await storeCuration.addGameOverride(store.id, game.slug, "SHOW", undefined);
    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ draft_revision: 3 });

    await expect(
      storeCuration.addTagFilter(store.id, "strategy", "WHITELIST", 1),
    ).rejects.toMatchObject({ name: "ConflictError" });
    expect(
      await prisma.storeTagFilter.findUnique({
        where: { store_id_tag: { store_id: store.id, tag: "strategy" } },
      }),
    ).toBeNull();
    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ draft_revision: 3 });
  });

  test("sales analytics are strictly scoped to the managed Outlet", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const buyer = await orchestrator.createUser();
    const firstStore = await orchestrator.createStore(owner.id, {
      name: "First Sales Scope",
      catalog_mode: "ALL",
    });
    const secondStore = await orchestrator.createStore(owner.id, {
      name: "Second Sales Scope",
      catalog_mode: "ALL",
    });
    const game = await activeGame(owner.id, "Sales Scope Game");

    await prisma.sale.createMany({
      data: [
        {
          user_id: buyer.id,
          game_id: game.id,
          store_id: firstStore.id,
          price_at_sale: 10,
          currency: "USD",
        },
        {
          user_id: buyer.id,
          game_id: game.id,
          store_id: firstStore.id,
          price_at_sale: 10,
          currency: "USD",
        },
        {
          user_id: buyer.id,
          game_id: game.id,
          store_id: secondStore.id,
          price_at_sale: 10,
          currency: "USD",
        },
        {
          user_id: buyer.id,
          game_id: game.id,
          store_id: null,
          price_at_sale: 10,
          currency: "USD",
        },
      ],
    });

    const firstState = await storeCuration.getCurationManagementState(
      firstStore.id,
      [game.id],
    );
    const secondState = await storeCuration.getCurationManagementState(
      secondStore.id,
      [game.id],
    );

    expect(firstState.sales_by_game_id.get(game.id)).toBe(2);
    expect(secondState.sales_by_game_id.get(game.id)).toBe(1);
  });

  test("concurrent identical bulk requests converge on one durable batch", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    const game = await activeGame(owner.id, "Concurrent Bulk Game");
    const preview = await storeCuration.previewBulkCuration(store.id, {
      action: "SHOW",
      game_slugs: [game.slug],
      expected_draft_revision: 1,
    });
    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ draft_revision: 1 });
    expect(
      await prisma.storeGameOverride.count({ where: { store_id: store.id } }),
    ).toBe(0);
    const input = {
      operation_id: randomUUID(),
      action: "SHOW" as const,
      game_slugs: [game.slug],
      expected_draft_revision: 1,
      request_fingerprint: preview.request_fingerprint,
    };

    const results = await Promise.all([
      storeCuration.applyBulkCuration(store.id, input),
      storeCuration.applyBulkCuration(store.id, input),
    ]);

    expect(new Set(results.map((result) => result.batch_id)).size).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(
      await prisma.storeCurationBatch.count({
        where: { store_id: store.id, operation_id: input.operation_id },
      }),
    ).toBe(1);
    expect(
      await prisma.storeGameOverride.count({ where: { store_id: store.id } }),
    ).toBe(1);
    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ draft_revision: 2 });

    const collisionPreview = await storeCuration.previewBulkCuration(store.id, {
      action: "HIDE",
      game_slugs: [game.slug],
      expected_draft_revision: 2,
    });
    await expect(
      storeCuration.applyBulkCuration(store.id, {
        ...input,
        action: "HIDE",
        expected_draft_revision: 2,
        request_fingerprint: collisionPreview.request_fingerprint,
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });
  });

  test("a stale bulk preview cannot partially mutate the draft", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    const game = await activeGame(owner.id, "Stale Bulk Game");
    const preview = await storeCuration.previewBulkCuration(store.id, {
      action: "SHOW",
      game_slugs: [game.slug],
      expected_draft_revision: 1,
    });
    await storeCuration.addTagFilter(
      store.id,
      "strategy",
      "WHITELIST",
      undefined,
    );

    await expect(
      storeCuration.applyBulkCuration(store.id, {
        operation_id: randomUUID(),
        action: "SHOW",
        game_slugs: [game.slug],
        expected_draft_revision: 1,
        request_fingerprint: preview.request_fingerprint,
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });
    expect(
      await prisma.storeGameOverride.count({ where: { store_id: store.id } }),
    ).toBe(0);
    expect(
      await prisma.storeCurationBatch.count({ where: { store_id: store.id } }),
    ).toBe(0);
    expect(
      await prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    ).toMatchObject({ draft_revision: 2 });
  });

  test("bulk undo is idempotent when the original response is lost", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    const game = await activeGame(owner.id, "Bulk Undo Game");
    const preview = await storeCuration.previewBulkCuration(store.id, {
      action: "SHOW",
      game_slugs: [game.slug],
      expected_draft_revision: 1,
    });
    const applied = await storeCuration.applyBulkCuration(store.id, {
      operation_id: randomUUID(),
      action: "SHOW",
      game_slugs: [game.slug],
      expected_draft_revision: 1,
      request_fingerprint: preview.request_fingerprint,
    });

    const undoResults = await Promise.all([
      storeCuration.undoBulkCuration(
        store.id,
        applied.batch_id,
        applied.draft_revision,
      ),
      storeCuration.undoBulkCuration(
        store.id,
        applied.batch_id,
        applied.draft_revision,
      ),
    ]);

    expect(undoResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          already_undone: false,
          undone_count: 1,
          draft_revision: 3,
        }),
        expect.objectContaining({
          already_undone: true,
          undone_count: 0,
          draft_revision: 3,
        }),
      ]),
    );
    expect(
      await prisma.storeGameOverride.count({ where: { store_id: store.id } }),
    ).toBe(0);
  });

  test("tag-rule undo is idempotent with the original expected revision", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    const applied = await storeCuration.applyTagRuleChange(store.id, {
      action: "UPSERT",
      tag: "RPG",
      mode: "WHITELIST",
      expected_draft_revision: 1,
    });

    const firstUndo = await storeCuration.undoTagRuleChange(
      store.id,
      applied.change_id!,
      applied.draft_revision,
    );
    const replayedUndo = await storeCuration.undoTagRuleChange(
      store.id,
      applied.change_id!,
      applied.draft_revision,
    );

    expect(firstUndo).toEqual({ already_undone: false, draft_revision: 3 });
    expect(replayedUndo).toEqual({
      already_undone: true,
      draft_revision: 3,
    });
    expect(
      await prisma.storeTagFilter.count({ where: { store_id: store.id } }),
    ).toBe(0);
  });
});
