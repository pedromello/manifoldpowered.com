import { Prisma, type Game } from "generated/prisma/client";
import { RateLimitError, ServiceError, ValidationError } from "infra/errors";
import { createStoreImportService } from "models/external_import/service";
import type {
  ImportAudit,
  ImportDependencies,
  StoreImportStrategy,
  StoreSnapshot,
} from "models/external_import/contracts";

interface VaultReference {
  sku: string;
}

interface VaultLease {
  state: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  token: number;
  error?: Error;
}

interface MemoryTransaction {
  games: Map<string, Game>;
  fenced: boolean;
}

function savedGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-id",
    studio_id: null,
    publisher_id: null,
    title: "Old title",
    slug: "preserved-game-slug",
    description: "Old description",
    detailed_description: "Old details",
    launch_date: null,
    status: "ONLY_DISPLAY",
    price: new Prisma.Decimal(0),
    base_price: null,
    discount_label: null,
    tags: [],
    developer_name: "Vault developer",
    publisher_name: null,
    steam_app_id: null,
    nintendo_nsuid: null,
    steam_price: null,
    steam_original_price: null,
    steam_discount_percent: null,
    steam_price_currency: null,
    steam_price_captured_at: null,
    meta_tags: {},
    media: {},
    social_links: {},
    requirements: {},
    positive_reviews: 12,
    negative_reviews: 1,
    review_score: "POSITIVE",
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Deliberately has neither a Steam App ID nor a Nintendo URL/NSUID. */
class ArcadeVaultStrategy implements StoreImportStrategy<VaultReference> {
  title = "Vault game";
  failure: Error | null = null;

  constructor(private readonly beforeFetch: () => void) {}

  parseReference(input: string): VaultReference {
    const match = /^vault:([a-z0-9-]+)$/.exec(input);
    if (!match)
      throw new ValidationError({
        message: "Invalid Arcade Vault reference.",
        action: "Enter a vault:sku reference.",
      });
    return { sku: match[1] };
  }

  async fetchSnapshot(
    reference: VaultReference,
    audit: ImportAudit,
  ): Promise<StoreSnapshot> {
    this.beforeFetch();
    if (this.failure) {
      audit.regionalOutcomes.BR = "NETWORK_ERROR";
      throw this.failure;
    }
    audit.regionalOutcomes.BR = "SUCCESS";
    return {
      externalId: reference.sku,
      suggestedSlug: `vault-${reference.sku}`,
      fields: {
        title: this.title,
        description: "Vault description",
        detailed_description: "Vault details",
        launch_date: null,
        developer_name: "Vault developer",
        publisher_name: null,
        tags: ["arcade"],
        meta_tags: { features: { single_player: true } },
        media: {},
      },
      localizations: [],
      offers: [],
    };
  }
}

function harness(initialGame?: Game) {
  let games = new Map<string, Game>(initialGame ? [["sku", initialGame]] : []);
  let lease: VaultLease = { state: "IDLE", token: 0 };
  let transactionOpen = false;
  const events: string[] = [];
  const strategy = new ArcadeVaultStrategy(() => {
    expect(transactionOpen).toBe(false);
    expect(lease.state).toBe("RUNNING");
    events.push("fetch");
  });
  const fetchSnapshot = jest.spyOn(strategy, "fetchSnapshot");

  const dependencies: ImportDependencies<
    VaultReference,
    VaultLease,
    MemoryTransaction
  > = {
    label: "Arcade Vault",
    strategy,
    attempts: {
      reserve: jest.fn(async () => {
        events.push("quota");
        return { id: "attempt-id" };
      }),
      finish: jest.fn(async () => {}),
    },
    managedGame: jest.fn(async () => null),
    coordination: {
      reserve: jest.fn(async (reference: VaultReference) => {
        events.push("reserve");
        const acquired = lease.state === "IDLE";
        if (acquired) lease = { state: "RUNNING", token: lease.token + 1 };
        return { acquired, row: lease, game: games.get(reference.sku) ?? null };
      }),
      fence: jest.fn(async (tx: MemoryTransaction, row: VaultLease) => {
        events.push("fence");
        expect(transactionOpen).toBe(true);
        if (row.token !== lease.token)
          throw new ServiceError({
            message: "Lease expired.",
            action: "Try again later.",
          });
        tx.fenced = true;
      }),
      complete: jest.fn(async (tx: MemoryTransaction, row: VaultLease) => {
        events.push("complete");
        expect(transactionOpen).toBe(true);
        expect(tx.fenced).toBe(true);
        if (row.token !== lease.token)
          throw new ServiceError({
            message: "Lease expired.",
            action: "Try again later.",
          });
        lease = { ...row, state: "SUCCESS" };
        return lease;
      }),
      fail: jest.fn(async (row: VaultLease, error: Error) => {
        expect(transactionOpen).toBe(false);
        if (row.token === lease.token)
          lease = { ...row, state: "FAILED", error };
      }),
      failure: (row) => row.error ?? new Error("Cached failure"),
      metadata: (row, cached = false) => ({
        operation_id: `operation-${row.token}`,
        state:
          row.state === "RUNNING"
            ? "in_progress"
            : row.state === "FAILED"
              ? "failed"
              : cached
                ? "cached"
                : "updated",
        last_completed_at: null,
        next_allowed_at: null,
      }),
    },
    async transaction(work) {
      expect(transactionOpen).toBe(false);
      events.push("begin");
      transactionOpen = true;
      const tx = { games: new Map(games), fenced: false };
      try {
        const result = await work(tx);
        games = tx.games;
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      } finally {
        transactionOpen = false;
      }
    },
    persist: jest.fn(async (tx: MemoryTransaction, snapshot: StoreSnapshot) => {
      events.push("persist");
      expect(transactionOpen).toBe(true);
      expect(tx.fenced).toBe(true);
      const existing = tx.games.get(snapshot.externalId);
      const game = savedGame({
        ...existing,
        slug: existing?.slug ?? snapshot.suggestedSlug,
        title: snapshot.fields.title,
      });
      tx.games.set(snapshot.externalId, game);
      return { game, created: !existing };
    }),
  };

  return {
    dependencies,
    strategy,
    fetchSnapshot,
    events,
    importGame: createStoreImportService(dependencies),
    game: () => games.get("sku"),
    allowRefresh: () => {
      lease = { ...lease, state: "IDLE" };
    },
    pending: () => {
      lease = { state: "RUNNING", token: lease.token + 1 };
    },
    replaceLease: () => {
      lease = { state: "RUNNING", token: lease.token + 1 };
    },
  };
}

const request = { userId: "user-id", input: "vault:sku" };

test("a third store creates, reuses and updates through the same service", async () => {
  const subject = harness();
  const created = await subject.importGame(request);
  expect(created).toMatchObject({
    created: true,
    game: { title: "Vault game", slug: "vault-sku" },
    refresh: { state: "updated" },
  });
  expect(subject.events).toEqual([
    "quota",
    "reserve",
    "fetch",
    "begin",
    "fence",
    "persist",
    "complete",
    "commit",
  ]);
  const cached = await subject.importGame(request);
  expect(cached).toMatchObject({
    created: false,
    refresh: { state: "cached" },
  });
  expect(cached.game).toEqual(created.game);
  expect(subject.fetchSnapshot).toHaveBeenCalledTimes(1);
  expect(subject.dependencies.attempts.reserve).toHaveBeenCalledTimes(2);
  expect(subject.dependencies.attempts.finish).toHaveBeenLastCalledWith(
    "attempt-id",
    "CACHE_HIT",
  );

  subject.strategy.title = "New Vault title";
  subject.allowRefresh();
  const updated = await subject.importGame(request);
  expect(updated.created).toBe(false);
  expect(updated.game).toMatchObject({
    id: created.game?.id,
    slug: "vault-sku",
    title: "New Vault title",
    positive_reviews: 12,
  });
  expect(subject.fetchSnapshot).toHaveBeenCalledTimes(2);
  expect(subject.dependencies.coordination.complete).toHaveBeenLastCalledWith(
    expect.objectContaining({ fenced: true }),
    expect.objectContaining({ state: "RUNNING" }),
    updated.game,
    { BR: "SUCCESS" },
    { sku: "sku" },
  );
});

test.each([false, true])(
  "an existing operation returns saved data when available: %s",
  async (hasGame) => {
    const existing = hasGame ? savedGame() : undefined;
    const subject = harness(existing);
    subject.pending();
    const result = await subject.importGame(request);
    expect(result).toEqual({
      game: existing ?? null,
      created: false,
      refresh: {
        operation_id: "operation-1",
        state: "in_progress",
        last_completed_at: null,
        next_allowed_at: null,
      },
    });
    expect(subject.fetchSnapshot).not.toHaveBeenCalled();
    expect(subject.dependencies.persist).not.toHaveBeenCalled();
    expect(subject.dependencies.attempts.finish).toHaveBeenCalledWith(
      "attempt-id",
      "SHARED_IN_PROGRESS",
    );
  },
);

test("a managed game remains unchanged and preserves the null refresh contract", async () => {
  const existing = savedGame({ studio_id: "studio-id" });
  const subject = harness(existing);
  jest.spyOn(subject.dependencies, "managedGame").mockResolvedValue(existing);
  await expect(subject.importGame(request)).resolves.toEqual({
    game: existing,
    created: false,
    refresh: null,
  });
  expect(subject.dependencies.coordination.reserve).not.toHaveBeenCalled();
  expect(subject.fetchSnapshot).not.toHaveBeenCalled();
  expect(subject.dependencies.attempts.finish).toHaveBeenCalledWith(
    "attempt-id",
    "SKIPPED_MANAGED",
  );
});

test("invalid references and exhausted quota cannot reach coordination or the source", async () => {
  const subject = harness();
  await expect(
    subject.importGame({ ...request, input: "unrecognized" }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(subject.dependencies.attempts.reserve).not.toHaveBeenCalled();
  const error = new RateLimitError();
  jest.spyOn(subject.dependencies.attempts, "reserve").mockRejectedValue(error);
  await expect(subject.importGame(request)).rejects.toBe(error);
  expect(subject.dependencies.coordination.reserve).not.toHaveBeenCalled();
  expect(subject.fetchSnapshot).not.toHaveBeenCalled();
});

test("administrator quota handling still passes through shared coordination", async () => {
  const subject = harness();
  await subject.importGame({ ...request, isAdmin: true });
  expect(subject.dependencies.attempts.reserve).toHaveBeenCalledWith(
    "user-id",
    { sku: "sku" },
    true,
  );
  expect(subject.dependencies.coordination.reserve).toHaveBeenCalledWith({
    sku: "sku",
  });
  expect(subject.dependencies.coordination.fence).toHaveBeenCalledTimes(1);
});

test("capacity rejection is audited before any source request or transaction", async () => {
  const subject = harness();
  const error = new ServiceError({
    message: "No execution slot.",
    action: "Try again later.",
  });
  jest
    .spyOn(subject.dependencies.coordination, "reserve")
    .mockRejectedValue(error);
  await expect(subject.importGame(request)).rejects.toBe(error);
  expect(subject.fetchSnapshot).not.toHaveBeenCalled();
  expect(subject.events).not.toContain("begin");
  expect(subject.dependencies.attempts.finish).toHaveBeenCalledWith(
    "attempt-id",
    "CAPACITY_UNAVAILABLE",
  );
});

test("source failures preserve saved data and reuse the cached failure", async () => {
  const existing = savedGame();
  const subject = harness(existing);
  const sourceError = new ServiceError({
    message: "Vault unavailable.",
    action: "Try again later.",
  });
  subject.strategy.failure = sourceError;
  await expect(subject.importGame(request)).rejects.toBe(sourceError);
  await expect(subject.importGame(request)).rejects.toBe(sourceError);
  expect(subject.game()).toEqual(existing);
  expect(subject.fetchSnapshot).toHaveBeenCalledTimes(1);
  expect(subject.events).not.toContain("begin");
  expect(subject.dependencies.coordination.fail).toHaveBeenCalledWith(
    expect.anything(),
    sourceError,
    { BR: "NETWORK_ERROR" },
  );
  expect(subject.dependencies.attempts.finish).toHaveBeenLastCalledWith(
    "attempt-id",
    "CACHED_FAILURE",
  );
});

test("unexpected failures are normalized before caching or exposing their message", async () => {
  const subject = harness();
  const privateError = new Error("private database diagnostic");
  jest.spyOn(subject.dependencies, "persist").mockRejectedValue(privateError);
  await expect(subject.importGame(request)).rejects.toMatchObject({
    name: "ServiceError",
    message: "Arcade Vault import failed.",
    cause: privateError,
  });
  expect(subject.dependencies.coordination.fail).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ message: "Arcade Vault import failed." }),
    { BR: "SUCCESS" },
  );
  expect(subject.dependencies.attempts.finish).toHaveBeenCalledWith(
    "attempt-id",
    "INVALID_DATA",
    expect.anything(),
    privateError,
  );
  expect(subject.game()).toBeUndefined();
  expect(subject.events).toContain("rollback");
});

test("a lost lease prevents persistence and cannot replace the current operation", async () => {
  const subject = harness(savedGame());
  const originalFetch = subject.strategy.fetchSnapshot.bind(subject.strategy);
  subject.fetchSnapshot.mockImplementationOnce(async (reference, audit) => {
    const snapshot = await originalFetch(reference, audit);
    subject.replaceLease();
    return snapshot;
  });
  await expect(subject.importGame(request)).rejects.toThrow("Lease expired.");
  expect(subject.dependencies.persist).not.toHaveBeenCalled();
  expect(subject.dependencies.coordination.complete).not.toHaveBeenCalled();
  expect(subject.events).toContain("rollback");
  const follower = await subject.importGame(request);
  expect(follower.refresh).toMatchObject({
    state: "in_progress",
    operation_id: "operation-2",
  });
  expect(follower.game?.title).toBe("Old title");
});

test("losing the lease at completion rolls back a pending game write", async () => {
  const subject = harness(savedGame());
  const originalComplete = subject.dependencies.coordination.complete;
  jest
    .spyOn(subject.dependencies.coordination, "complete")
    .mockImplementationOnce(async (...args) => {
      subject.replaceLease();
      return originalComplete(...args);
    });
  await expect(subject.importGame(request)).rejects.toThrow("Lease expired.");
  expect(subject.dependencies.persist).toHaveBeenCalledTimes(1);
  expect(subject.events).toContain("rollback");
  expect(subject.events).not.toContain("commit");
  expect(subject.game()?.title).toBe("Old title");
});
