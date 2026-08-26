import { prisma } from "infra/database";
import { NotFoundError } from "infra/errors";
import storeFollow from "models/store_follow";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("models/store_follow", () => {
  test("follow is idempotent, including concurrent calls", async () => {
    const player = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);

    await Promise.all([
      storeFollow.follow(player.id, store.slug),
      storeFollow.follow(player.id, store.slug),
    ]);

    expect(
      await prisma.storeFollow.count({
        where: { user_id: player.id, store_id: store.id },
      }),
    ).toBe(1);
  });

  test("validates the logical Outlet reference before writing", async () => {
    const player = await orchestrator.createUser();

    await expect(
      storeFollow.follow(player.id, "missing-outlet"),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(
      await prisma.storeFollow.count({ where: { user_id: player.id } }),
    ).toBe(0);
  });

  test("lists only one user's live Outlets in follow order", async () => {
    const player = await orchestrator.createUser();
    const otherPlayer = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const olderStore = await orchestrator.createStore(owner.id);
    const newerStore = await orchestrator.createStore(owner.id);
    const otherStore = await orchestrator.createStore(owner.id);

    await prisma.storeFollow.createMany({
      data: [
        {
          user_id: player.id,
          store_id: olderStore.id,
          created_at: new Date("2026-08-24T10:00:00.000Z"),
        },
        {
          user_id: player.id,
          store_id: newerStore.id,
          created_at: new Date("2026-08-25T10:00:00.000Z"),
        },
        {
          user_id: player.id,
          store_id: "orphaned-store-id",
          created_at: new Date("2026-08-26T10:00:00.000Z"),
        },
        {
          user_id: otherPlayer.id,
          store_id: otherStore.id,
          created_at: new Date("2026-08-27T10:00:00.000Z"),
        },
      ],
    });

    const stores = await storeFollow.listForUser(player.id);

    expect(stores.map((store) => store.id)).toEqual([
      newerStore.id,
      olderStore.id,
    ]);
  });

  test("status is requester-specific and anonymous-safe", async () => {
    const player = await orchestrator.createUser();
    const otherPlayer = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);
    await storeFollow.follow(player.id, store.slug);

    await expect(storeFollow.status(player.id, store.slug)).resolves.toEqual({
      is_followed: true,
    });
    await expect(
      storeFollow.status(otherPlayer.id, store.slug),
    ).resolves.toEqual({ is_followed: false });
    await expect(storeFollow.status(undefined, store.slug)).resolves.toEqual({
      is_followed: false,
    });
  });

  test("unfollow is idempotent and isolated by user", async () => {
    const player = await orchestrator.createUser();
    const otherPlayer = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);
    await storeFollow.follow(player.id, store.slug);
    await storeFollow.follow(otherPlayer.id, store.slug);

    await storeFollow.unfollow(player.id, store.slug);
    await storeFollow.unfollow(player.id, store.slug);

    expect(
      await prisma.storeFollow.findUnique({
        where: {
          user_id_store_id: {
            user_id: player.id,
            store_id: store.id,
          },
        },
      }),
    ).toBeNull();
    expect(
      await prisma.storeFollow.findUnique({
        where: {
          user_id_store_id: {
            user_id: otherPlayer.id,
            store_id: store.id,
          },
        },
      }),
    ).not.toBeNull();
  });
});
