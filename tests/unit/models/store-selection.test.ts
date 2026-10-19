import { prisma } from "infra/database";
import storeSelection from "models/store_selection";
import type { StoreSelection } from "generated/prisma/client";

jest.mock("infra/database", () => ({
  prisma: {
    $transaction: jest.fn(),
    storeSelectionRevision: { findFirst: jest.fn() },
    game: { findMany: jest.fn() },
  },
}));
jest.mock("models/store_catalog", () => ({
  getCurationWhereClause: jest.fn().mockResolvedValue({}),
  getSnapshotCurationWhereClause: jest.fn().mockResolvedValue({}),
}));
jest.mock("models/store_revision", () => ({
  parseStoreRevision: () => ({ catalog: {} }),
}));

function selection(overrides: Partial<StoreSelection> = {}): StoreSelection {
  return {
    id: "selection-id",
    store_id: "outlet-id",
    slug: "weekend",
    title: "Weekend co-op",
    description: "A selection for friends.",
    cover_url: "https://cdn.example.com/cover.png",
    featured_video_id: null,
    image_urls: [],
    game_ids: ["game-1", "game-2"],
    draft_revision: 4,
    status: "DRAFT",
    published_revision: 0,
    published_revision_id: null,
    published_at: null,
    created_at: new Date("2026-10-16T12:00:00Z"),
    updated_at: new Date("2026-10-16T12:00:00Z"),
    ...overrides,
  };
}
function transaction(row = selection(), count = 1) {
  const tx = {
    storeSelection: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...row,
          ...data,
          draft_revision: row.draft_revision + 1,
        }),
      ),
      create: jest.fn(),
    },
    store: {
      findUnique: jest.fn().mockResolvedValue({
        id: "outlet-id",
        slug: "cozy",
        status: "PUBLISHED",
        published_revision_id: "outlet-revision",
      }),
    },
    storeRevision: {
      findFirst: jest.fn().mockResolvedValue({ id: "outlet-revision" }),
    },
    game: {
      findMany: jest.fn().mockResolvedValue([
        { id: "game-1", slug: "peak" },
        { id: "game-2", slug: "repo" },
      ]),
    },
    storeSelectionRevision: {
      create: jest.fn().mockResolvedValue({
        id: "new-revision",
        revision: row.published_revision + 1,
        created_at: new Date("2026-10-16T13:00:00Z"),
      }),
    },
  };
  jest
    .mocked(prisma.$transaction)
    .mockImplementationOnce(
      async (
        operation: (value: unknown) => Promise<unknown>,
        options: unknown,
      ) => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
        return operation(tx);
      },
    );
  return tx;
}

beforeEach(() => jest.clearAllMocks());

describe("outlet selection publication", () => {
  test("rejects a stale editor before changing a draft or creating a publication", async () => {
    const tx = transaction();
    await expect(
      storeSelection.update("outlet-id", "weekend", {
        title: "Changed",
        expected_draft_revision: 3,
      }),
    ).rejects.toMatchObject({
      name: "ConflictError",
      context: { actual_draft_revision: 4 },
    });
    expect(tx.storeSelection.updateMany).not.toHaveBeenCalled();
    expect(tx.storeSelection.update).not.toHaveBeenCalled();
    expect(tx.storeSelectionRevision.create).not.toHaveBeenCalled();
  });
  test("a lost compare-and-swap does not write content", async () => {
    const tx = transaction(selection(), 0);
    await expect(
      storeSelection.update("outlet-id", "weekend", {
        title: "Changed",
        expected_draft_revision: 4,
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });
    expect(tx.storeSelection.update).not.toHaveBeenCalled();
  });
  test("publishes an immutable ordered snapshot tied to the inspected draft", async () => {
    const row = selection();
    const tx = transaction(row);
    const result = await storeSelection.publish(
      "outlet-id",
      "weekend",
      "creator-id",
      4,
    );
    expect(tx.storeSelectionRevision.create).toHaveBeenCalledWith({
      data: {
        selection_id: row.id,
        revision: 1,
        source_draft_revision: 4,
        actor_user_id: "creator-id",
        snapshot: {
          title: row.title,
          description: row.description,
          cover_url: row.cover_url,
          featured_video: null,
          image_urls: [],
          game_ids: ["game-1", "game-2"],
        },
      },
    });
    expect(result.status).toBe("PUBLISHED");
    expect(result.published_revision_id).toBe("new-revision");
    expect(result.draft_revision).toBe(5);
  });
  test("blocks publication when a game is outside the published outlet catalog", async () => {
    const tx = transaction();
    tx.game.findMany.mockResolvedValueOnce([{ id: "game-1", slug: "peak" }]);
    await expect(
      storeSelection.publish("outlet-id", "weekend", "creator-id", 4),
    ).rejects.toMatchObject({
      name: "ValidationError",
      context: {
        ready: false,
        blockers: [
          { code: "GAMES_OUTSIDE_PUBLISHED_CATALOG", game_ids: ["game-2"] },
        ],
      },
    });
    expect(tx.storeSelectionRevision.create).not.toHaveBeenCalled();
  });
  test("requires outlet publication, explanatory copy, a cover and games", async () => {
    const tx = transaction(
      selection({ description: "", cover_url: null, game_ids: [] }),
    );
    tx.store.findUnique.mockResolvedValueOnce({
      id: "outlet-id",
      slug: "cozy",
      status: "DRAFT",
      published_revision_id: null,
    });
    await expect(
      storeSelection.publish("outlet-id", "weekend", "creator-id", 4),
    ).rejects.toMatchObject({
      name: "ValidationError",
      context: {
        ready: false,
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: "DESCRIPTION_REQUIRED" }),
          expect.objectContaining({ code: "COVER_REQUIRED" }),
          expect.objectContaining({ code: "GAMES_REQUIRED" }),
          expect.objectContaining({ code: "OUTLET_NOT_PUBLISHED" }),
        ]),
      },
    });
  });
  test("draft edits do not replace or expose published content", async () => {
    const row = selection({
      status: "PUBLISHED",
      published_revision: 1,
      published_revision_id: "published-id",
    });
    const content = storeSelection.snapshot(row);
    jest
      .mocked(prisma.storeSelectionRevision.findFirst)
      .mockResolvedValue({ selection_id: row.id, snapshot: content } as never);
    const tx = transaction(row);
    const edited = await storeSelection.update("outlet-id", "weekend", {
      title: "Private new title",
      expected_draft_revision: 4,
    });
    expect(edited.title).toBe("Private new title");
    expect(tx.storeSelectionRevision.create).not.toHaveBeenCalled();
    await expect(storeSelection.publicSnapshot(edited)).resolves.toMatchObject({
      title: "Weekend co-op",
    });
    jest.mocked(prisma.game.findMany).mockResolvedValue([]);
    const publicSummary = await storeSelection.summary(edited, "cozy", content);
    expect(publicSummary.title).toBe("Weekend co-op");
    expect(publicSummary).not.toHaveProperty("draft_revision");
  });
  test("withdrawing clears public visibility and preserves the publication counter", async () => {
    const tx = transaction(
      selection({
        status: "PUBLISHED",
        published_revision: 2,
        published_revision_id: "current-id",
      }),
    );
    const result = await storeSelection.unpublish("outlet-id", "weekend", 4);
    expect(result.status).toBe("DRAFT");
    expect(result.published_revision_id).toBeNull();
    expect(result.published_revision).toBe(2);
    expect(tx.storeSelectionRevision.create).not.toHaveBeenCalled();
    await expect(storeSelection.publicSnapshot(result)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});
