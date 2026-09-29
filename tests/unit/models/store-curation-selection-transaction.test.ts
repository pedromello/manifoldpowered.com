import { prisma } from "infra/database";
import storeCuration from "models/store_curation";

jest.mock("infra/database", () => ({
  prisma: { $transaction: jest.fn() },
}));

type TransactionDouble = ReturnType<typeof transactionDouble>;

const mockPrisma = prisma as unknown as { $transaction: jest.Mock };
const games = Array.from({ length: 5 }, (_, index) => ({
  id: `game-${index + 1}`,
  slug: `game-${index + 1}`,
}));

function transactionDouble({
  draftRevision = 7,
  catalogMode = "UNDECIDED",
  tagFilterCount = 0,
  gameOverrideCount = 0,
  eligibleGames = games,
  revisionUpdateCount = 1,
}: {
  draftRevision?: number;
  catalogMode?: "UNDECIDED" | "ALL" | "SELECTED";
  tagFilterCount?: number;
  gameOverrideCount?: number;
  eligibleGames?: typeof games;
  revisionUpdateCount?: number;
} = {}) {
  return {
    store: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValueOnce({ draft_revision: draftRevision })
        .mockResolvedValueOnce({ catalog_mode: catalogMode }),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: revisionUpdateCount }),
    },
    storeTagFilter: {
      count: jest.fn().mockResolvedValue(tagFilterCount),
      createMany: jest.fn().mockResolvedValue({ count: tagFilterCount }),
    },
    storeGameOverride: {
      count: jest.fn().mockResolvedValue(gameOverrideCount),
      createMany: jest.fn().mockResolvedValue({ count: eligibleGames.length }),
    },
    game: {
      findMany: jest.fn().mockResolvedValue(eligibleGames),
    },
  };
}

function runInTransaction(transaction: TransactionDouble) {
  mockPrisma.$transaction.mockImplementationOnce(
    async (
      operation: (value: TransactionDouble) => Promise<unknown>,
      options: unknown,
    ) => {
      expect(options).toEqual({ isolationLevel: "Serializable" });
      return operation(transaction);
    },
  );
}

function selection(expectedDraftRevision = 7) {
  return {
    strategy: "HANDPICKED" as const,
    tags: [],
    game_slugs: games.map((game) => game.slug),
    expected_draft_revision: expectedDraftRevision,
  };
}

describe("creator selection transaction", () => {
  beforeEach(() => jest.clearAllMocks());

  test("fails stale CAS before any catalog mutation", async () => {
    const transaction = transactionDouble({ draftRevision: 8 });
    runInTransaction(transaction);

    await expect(
      storeCuration.replaceCreatorSelection("store-1", selection(7)),
    ).rejects.toMatchObject({
      name: "ConflictError",
      context: { expected_draft_revision: 7, actual_draft_revision: 8 },
    });

    expect(transaction.store.update).not.toHaveBeenCalled();
    expect(transaction.store.updateMany).not.toHaveBeenCalled();
    expect(transaction.storeTagFilter.createMany).not.toHaveBeenCalled();
    expect(transaction.storeGameOverride.createMany).not.toHaveBeenCalled();
  });

  test.each([
    {
      catalogMode: "SELECTED" as const,
      tagFilterCount: 0,
      gameOverrideCount: 0,
    },
    {
      catalogMode: "UNDECIDED" as const,
      tagFilterCount: 1,
      gameOverrideCount: 0,
    },
    {
      catalogMode: "UNDECIDED" as const,
      tagFilterCount: 0,
      gameOverrideCount: 1,
    },
  ])("fails closed without replacing existing curation: %p", async (state) => {
    const transaction = transactionDouble(state);
    runInTransaction(transaction);

    await expect(
      storeCuration.replaceCreatorSelection("store-1", selection()),
    ).rejects.toMatchObject({ name: "ConflictError" });

    expect(transaction.store.update).not.toHaveBeenCalled();
    expect(transaction.store.updateMany).not.toHaveBeenCalled();
    expect(transaction.storeTagFilter.createMany).not.toHaveBeenCalled();
    expect(transaction.storeGameOverride.createMany).not.toHaveBeenCalled();
  });

  test("atomically initializes a pristine handpicked selection and bumps once", async () => {
    const transaction = transactionDouble();
    runInTransaction(transaction);

    await expect(
      storeCuration.replaceCreatorSelection("store-1", selection()),
    ).resolves.toEqual({
      strategy: "HANDPICKED",
      catalog_mode: "SELECTED",
      tags: [],
      game_slugs: games.map((game) => game.slug),
      catalog_game_count: 5,
      draft_revision: 8,
    });

    expect(transaction.store.update).toHaveBeenCalledWith({
      where: { id: "store-1" },
      data: { catalog_mode: "SELECTED" },
    });
    expect(transaction.storeTagFilter.createMany).not.toHaveBeenCalled();
    expect(transaction.storeGameOverride.createMany).toHaveBeenCalledWith({
      data: games.map((game) => ({
        store_id: "store-1",
        game_id: game.id,
        visibility: "SHOW",
      })),
    });
    expect(transaction.store.updateMany).toHaveBeenCalledWith({
      where: { id: "store-1", draft_revision: 7 },
      data: { draft_revision: { increment: 1 } },
    });
    expect(transaction.store.update.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.store.updateMany.mock.invocationCallOrder[0],
    );
  });

  test("rejects the enclosing transaction when final CAS loses the race", async () => {
    const transaction = transactionDouble({ revisionUpdateCount: 0 });
    runInTransaction(transaction);

    await expect(
      storeCuration.replaceCreatorSelection("store-1", selection()),
    ).rejects.toMatchObject({ name: "ConflictError" });

    expect(transaction.store.update).toHaveBeenCalledTimes(1);
    expect(transaction.storeGameOverride.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.store.updateMany).toHaveBeenCalledTimes(1);
  });
});
